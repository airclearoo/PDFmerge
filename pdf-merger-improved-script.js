// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', function() {
    // 初始化变量
    let pdfFiles = [];
    let selectedFiles = new Set();
    let filePageCounts = {};
    let filePageSelections = {};
    let currentSortMethod = 'date';
    let searchTimeout;

    // DOM元素
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const fileCount = document.getElementById('file-count');
    const mergeBtn = document.getElementById('merge-btn');
    const selectAllBtn = document.getElementById('select-all-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const sortBtn = document.getElementById('sort-btn');
    const sortOptions = document.getElementById('sort-options');
    const searchInput = document.getElementById('search-input');
    const pageSelectorModal = document.getElementById('page-selector-modal');
    const pageSelector = document.getElementById('page-selector');
    const confirmPageSelection = document.getElementById('confirm-page-selection');
    const cancelPageSelection = document.getElementById('cancel-page-selection');
    const closePageSelector = document.getElementById('close-page-selector');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelp = document.getElementById('close-help');
    const closeHelpBtn = document.getElementById('close-help-btn');
    const aboutModal = document.getElementById('about-modal');
    const closeAbout = document.getElementById('close-about');
    const closeAboutBtn = document.getElementById('close-about-btn');

    // 初始化PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.12.313/build/pdf.worker.js';

    // 初始化拖放排序
    let sortable;

    // 文件拖放处理
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('highlight');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('highlight');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('highlight');
        handleFiles(e.dataTransfer.files);
    });

    // 文件选择处理
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // 处理选择的文件
    async function handleFiles(files) {
        showLoading('正在加载文件...');
        
        const validFiles = [];
        for (const file of files) {
            if (file.type === 'application/pdf') {
                // 检查文件是否已存在
                const exists = pdfFiles.some(f => f.name === file.name && f.size === file.size);
                if (!exists) {
                    validFiles.push(file);
                }
            }
        }
        
        if (validFiles.length === 0) {
            hideLoading();
            return;
        }
        
        // 获取每个文件的页数
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            updateProgress((i / validFiles.length) * 100);
            
            try {
                const pageCount = await getPageCount(file);
                filePageCounts[file.name] = pageCount;
                
                // 默认选择所有页面
                filePageSelections[file.name] = Array.from({ length: pageCount }, (_, i) => i);
                
                // 添加文件到列表
                file.addedAt = new Date();
                pdfFiles.push(file);
                selectedFiles.add(file.name);
            } catch (error) {
                console.error(`无法加载文件 ${file.name}:`, error);
            }
        }
        
        sortFiles();
        updateFileList();
        hideLoading();
    }

    // 获取PDF文件的页数
    async function getPageCount(file) {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        return pdf.numPages;
    }

    // 更新文件列表显示
    function updateFileList() {
        fileList.innerHTML = '';
        
        const searchTerm = searchInput.value.toLowerCase();
        const filteredFiles = pdfFiles.filter(file => 
            file.name.toLowerCase().includes(searchTerm)
        );
        
        if (filteredFiles.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'file-item';
            emptyMessage.textContent = searchTerm ? '没有匹配的文件' : '没有文件';
            fileList.appendChild(emptyMessage);
        } else {
            filteredFiles.forEach(file => {
                const item = document.createElement('div');
                item.className = 'file-item';
                item.dataset.filename = file.name;
                
                if (selectedFiles.has(file.name)) {
                    item.classList.add('selected');
                }
                
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';
                
                const icon = document.createElement('i');
                icon.className = 'fas fa-file-pdf file-icon';
                
                const nameContainer = document.createElement('div');
                
                const name = document.createElement('div');
                name.className = 'file-name';
                name.textContent = file.name;
                
                const pages = document.createElement('div');
                pages.className = 'file-pages';
                pages.textContent = `${filePageCounts[file.name] || '?'} 页`;
                
                nameContainer.appendChild(name);
                nameContainer.appendChild(pages);
                
                fileInfo.appendChild(icon);
                fileInfo.appendChild(nameContainer);
                
                const actions = document.createElement('div');
                actions.className = 'file-actions';
                
                const previewBtn = document.createElement('button');
                previewBtn.className = 'action-btn preview';
                previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
                previewBtn.title = '预览';
                previewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    previewFile(file);
                });
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'action-btn delete';
                deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
                deleteBtn.title = '删除';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFile(file);
                });
                
                actions.appendChild(previewBtn);
                actions.appendChild(deleteBtn);
                
                item.appendChild(fileInfo);
                item.appendChild(actions);
                
                item.addEventListener('click', () => {
                    toggleFileSelection(file);
                });
                
                fileList.appendChild(item);
            });
            
            // 初始化拖放排序
            if (sortable) {
                sortable.destroy();
            }
            
            sortable = new Sortable(fileList, {
                animation: 150,
                ghostClass: 'dragging',
                onEnd: function(evt) {
                    const oldIndex = evt.oldIndex;
                    const newIndex = evt.newIndex;
                    
                    // 更新文件数组
                    const searchTerm = searchInput.value.toLowerCase();
                    const filteredFiles = pdfFiles.filter(file => 
                        file.name.toLowerCase().includes(searchTerm)
                    );
                    
                    const movedFile = filteredFiles[oldIndex];
                    
                    // 找到实际索引
                    const actualOldIndex = pdfFiles.findIndex(f => f.name === movedFile.name);
                    
                    // 找到目标位置
                    let actualNewIndex;
                    if (newIndex >= filteredFiles.length - 1) {
                        // 移动到末尾
                        const lastFilteredFile = filteredFiles[filteredFiles.length - 1];
                        actualNewIndex = pdfFiles.findIndex(f => f.name === lastFilteredFile.name);
                    } else {
                        const targetFile = filteredFiles[newIndex];
                        actualNewIndex = pdfFiles.findIndex(f => f.name === targetFile.name);
                    }
                    
                    // 移动文件
                    const [removed] = pdfFiles.splice(actualOldIndex, 1);
                    pdfFiles.splice(actualNewIndex, 0, removed);
                }
            });
        }
        
        // 更新文件计数
        fileCount.textContent = `${pdfFiles.length} 个文件`;
        
        // 更新按钮状态
        mergeBtn.disabled = selectedFiles.size < 1;
        selectAllBtn.disabled = pdfFiles.length === 0;
        clearSelectionBtn.disabled = selectedFiles.size === 0;
        clearAllBtn.disabled = pdfFiles.length === 0;
    }

    // 切换文件选择状态
    function toggleFileSelection(file) {
        if (selectedFiles.has(file.name)) {
            selectedFiles.delete(file.name);
        } else {
            selectedFiles.add(file.name);
        }
        updateFileList();
    }

    // 移除文件
    function removeFile(file) {
        const index = pdfFiles.findIndex(f => f.name === file.name);
        if (index !== -1) {
            pdfFiles.splice(index, 1);
            selectedFiles.delete(file.name);
            delete filePageCounts[file.name];
            delete filePageSelections[file.name];
            updateFileList();
        }
    }

    // 预览文件（支持多页）
    async function previewFile(file) {
        showLoading('正在加载预览...');
        
        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const totalPages = pdf.numPages;
            let currentPage = 1;
            
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.display = 'flex';
            
            const modalContent = document.createElement('div');
            modalContent.className = 'modal';
            
            const modalHeader = document.createElement('div');
            modalHeader.className = 'modal-header';
            
            const modalTitle = document.createElement('h3');
            modalTitle.className = 'modal-title';
            modalTitle.textContent = `预览: ${file.name} (1/${totalPages})`;
            
            const pageControls = document.createElement('div');
            pageControls.className = 'page-controls';
            
            const prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn';
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
            prevBtn.disabled = true;
            
            const nextBtn = document.createElement('button');
            nextBtn.className = 'page-btn';
            nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
            if (totalPages <= 1) nextBtn.disabled = true;
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
            
            pageControls.appendChild(prevBtn);
            pageControls.appendChild(nextBtn);
            modalHeader.appendChild(modalTitle);
            modalHeader.appendChild(pageControls);
            modalHeader.appendChild(closeBtn);
            
            const modalBody = document.createElement('div');
            modalBody.className = 'modal-body';
            
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
            
            const canvas = document.createElement('canvas');
            canvas.className = 'preview-canvas';
            
            // 渲染页面函数
            async function renderPage(pageNum) {
                try {
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 1.5 });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    const renderContext = {
                        canvasContext: canvas.getContext('2d'),
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    modalTitle.textContent = `预览: ${file.name} (${pageNum}/${totalPages})`;
                    
                    prevBtn.disabled = pageNum <= 1;
                    nextBtn.disabled = pageNum >= totalPages;
                } catch (error) {
                    console.error('渲染页面出错:', error);
                }
            }
            
            // 翻页事件
            prevBtn.addEventListener('click', async () => {
                if (currentPage > 1) {
                    currentPage--;
                    await renderPage(currentPage);
                }
            });
            
            nextBtn.addEventListener('click', async () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    await renderPage(currentPage);
                }
            });
            
            previewContainer.appendChild(canvas);
            modalBody.appendChild(previewContainer);
            
            modalContent.appendChild(modalHeader);
            modalContent.appendChild(modalBody);
            
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            
            // 渲染第一页
            await renderPage(1);
            hideLoading();
        } catch (error) {
            hideLoading();
            alert('无法预览文件: ' + error.message);
            console.error(error);
        }
    }

    // 从文件名中提取数字
    function extractNumber(filename) {
        const match = filename.match(/\d+/);
        return match ? parseInt(match[0]) : Infinity;
    }

    // 排序文件
    function sortFiles() {
        switch (currentSortMethod) {
            case 'name':
                pdfFiles.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'number':
                pdfFiles.sort((a, b) => extractNumber(a.name) - extractNumber(b.name));
                break;
            case 'date':
                pdfFiles.sort((a, b) => a.addedAt - b.addedAt);
                break;
        }
        updateFileList();
    }

    // 显示加载中遮罩
    function showLoading(message) {
        loadingText.textContent = message || '正在处理，请稍候...';
        loadingOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
    }

    // 隐藏加载中遮罩
    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    // 更新进度条
    function updateProgress(percent) {
        const roundedPercent = Math.round(percent);
        progressBar.style.width = `${roundedPercent}%`;
        progressText.textContent = `${roundedPercent}%`;
    }

    // 辅助函数：将文件读取为ArrayBuffer
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    // 显示页面选择模态框
    async function showPageSelector() {
        if (selectedFiles.size === 0) {
            alert('请先选择要合并的文件');
            return;
        }
        
        showLoading('正在准备页面选择...');
        
        // 清空页面选择器
        pageSelector.innerHTML = '';
        
        // 获取选中的文件
        const filesToMerge = pdfFiles.filter(file => selectedFiles.has(file.name));
        
        // 为每个文件创建页面选择区域
        for (let i = 0; i < filesToMerge.length; i++) {
            const file = filesToMerge[i];
            updateProgress((i / filesToMerge.length) * 100);
            
            const fileContainer = document.createElement('div');
            fileContainer.className = 'file-pages-container';
            
            const fileHeader = document.createElement('div');
            fileHeader.className = 'file-pages-header';
            
            const fileTitle = document.createElement('div');
            fileTitle.className = 'file-pages-title';
            fileTitle.textContent = file.name;
            
            const fileControls = document.createElement('div');
            fileControls.className = 'file-controls';
            
            const selectAllPagesBtn = document.createElement('button');
            selectAllPagesBtn.className = 'btn btn-outline';
            selectAllPagesBtn.textContent = '全选';
            selectAllPagesBtn.addEventListener('click', () => {
                const checkboxes = fileContainer.querySelectorAll('.page-item');
                checkboxes.forEach(checkbox => {
                    checkbox.classList.add('selected');
                });
                filePageSelections[file.name] = Array.from({ length: filePageCounts[file.name] }, (_, i) => i);
            });
            
            const clearPagesBtn = document.createElement('button');
            clearPagesBtn.className = 'btn btn-outline';
            clearPagesBtn.textContent = '清除';
            clearPagesBtn.addEventListener('click', () => {
                const checkboxes = fileContainer.querySelectorAll('.page-item');
                checkboxes.forEach(checkbox => {
                    checkbox.classList.remove('selected');
                });
                filePageSelections[file.name] = [];
            });
            
            const pageRange = document.createElement('div');
            pageRange.className = 'page-range';
            
            const fromLabel = document.createElement('span');
            fromLabel.textContent = '从';
            
            const fromInput = document.createElement('input');
            fromInput.type = 'number';
            fromInput.min = 1;
            fromInput.max = filePageCounts[file.name];
            
            const toLabel = document.createElement('span');
            toLabel.textContent = '到';
            
            const toInput = document.createElement('input');
            toInput.type = 'number';
            toInput.min = 1;
            toInput.max = filePageCounts[file.name];
            toInput.value = filePageCounts[file.name];
            
            const selectRangeBtn = document.createElement('button');
            selectRangeBtn.className = 'btn btn-outline';
            selectRangeBtn.textContent = '选择范围';
            selectRangeBtn.addEventListener('click', () => {
                const from = parseInt(fromInput.value) || 1;
                const to = parseInt(toInput.value) || filePageCounts[file.name];
                
                if (from > to || from < 1 || to > filePageCounts[file.name]) {
                    alert('请输入有效的页码范围');
                    return;
                }
                
                const checkboxes = fileContainer.querySelectorAll('.page-item');
                checkboxes.forEach((checkbox, index) => {
                    const pageNum = index + 1;
                    if (pageNum >= from && pageNum <= to) {
                        checkbox.classList.add('selected');
                        if (!filePageSelections[file.name].includes(index)) {
                            filePageSelections[file.name].push(index);
                        }
                    }
                });
            });
            
            pageRange.appendChild(fromLabel);
            pageRange.appendChild(fromInput);
            pageRange.appendChild(toLabel);
            pageRange.appendChild(toInput);
            pageRange.appendChild(selectRangeBtn);
            
            fileControls.appendChild(selectAllPagesBtn);
            fileControls.appendChild(clearPagesBtn);
            
            fileHeader.appendChild(fileTitle);
            fileHeader.appendChild(fileControls);
            
            const pagesGrid = document.createElement('div');
            pagesGrid.className = 'pages-grid';
            
            // 加载页面预览
            try {
                const arrayBuffer = await readFileAsArrayBuffer(file);
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                
                for (let j = 0; j < filePageCounts[file.name]; j++) {
                    const pageItem = document.createElement('div');
                    pageItem.className = 'page-item';
                    pageItem.dataset.page = j;
                    
                    if (filePageSelections[file.name].includes(j)) {
                        pageItem.classList.add('selected');
                    }
                    
                    const pagePreview = document.createElement('div');
                    pagePreview.className = 'page-preview';
                    
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = `第 ${j + 1} 页`;
                    
                    pageItem.appendChild(pagePreview);
                    pageItem.appendChild(pageNumber);
                    
                    pageItem.addEventListener('click', () => {
                        pageItem.classList.toggle('selected');
                        
                        if (pageItem.classList.contains('selected')) {
                            if (!filePageSelections[file.name].includes(j)) {
                                filePageSelections[file.name].push(j);
                            }
                        } else {
                            const index = filePageSelections[file.name].indexOf(j);
                            if (index !== -1) {
                                filePageSelections[file.name].splice(index, 1);
                            }
                        }
                    });
                    
                    pagesGrid.appendChild(pageItem);
                    
                    // 加载页面预览（显示所有页面）
                    try {
                        const page = await pdf.getPage(j + 1);
                        const viewport = page.getViewport({ scale: 0.2 });
                        
                        const canvas = document.createElement('canvas');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        
                        const renderContext = {
                            canvasContext: canvas.getContext('2d'),
                            viewport: viewport
                        };
                        
                        await page.render(renderContext).promise;
                        
                        pagePreview.innerHTML = '';
                        pagePreview.appendChild(canvas);
                        
                        // 更新加载进度
                        updateProgress(Math.floor(((j + 1) / filePageCounts[file.name]) * 100));
                    } catch (error) {
                        console.error(`无法渲染页面预览 ${j + 1}:`, error);
                    }
                }
            } catch (error) {
                console.error(`无法加载文件预览 ${file.name}:`, error);
            }
            
            fileContainer.appendChild(fileHeader);
            fileContainer.appendChild(document.createElement('hr'));
            fileContainer.appendChild(pageRange);
            fileContainer.appendChild(pagesGrid);
            
            pageSelector.appendChild(fileContainer);
        }
        
        hideLoading();
        pageSelectorModal.style.display = 'flex';
    }

    // 合并PDF
    async function mergePDFs() {
        showLoading('正在合并PDF文件...');
        
        try {
            const mergedPdf = await PDFLib.PDFDocument.create();
            
            // 获取选中的文件
            const filesToMerge = pdfFiles.filter(file => selectedFiles.has(file.name));
            
            for (let i = 0; i < filesToMerge.length; i++) {
                const file = filesToMerge[i];
                updateProgress((i / filesToMerge.length) * 100);
                
                loadingText.textContent = `正在处理文件 ${i + 1}/${filesToMerge.length}: ${file.name}`;
                
                const fileData = await readFileAsArrayBuffer(file);
                const pdf = await PDFLib.PDFDocument.load(fileData);
                
                // 获取选中的页面
                const selectedPages = filePageSelections[file.name].sort((a, b) => a - b);
                
                if (selectedPages.length > 0) {
                    // 只复制选中的页面
                    const pages = await mergedPdf.copyPages(pdf, selectedPages);
                    pages.forEach(page => mergedPdf.addPage(page));
                } else {
                    // 如果没有选中页面，复制所有页面
                    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    pages.forEach(page => mergedPdf.addPage(page));
                }
            }
            
            loadingText.textContent = '正在生成合并后的PDF...';
            updateProgress(95);
            
            const mergedPdfBytes = await mergedPdf.save();
            
            loadingText.textContent = '完成！';
            updateProgress(100);
            
            // 下载合并后的PDF
            download(mergedPdfBytes, "merged.pdf", "application/pdf");
            
            setTimeout(hideLoading, 500);
        } catch (error) {
            hideLoading();
            alert('合并PDF时出错: ' + error.message);
            console.error(error);
        }
    }

    // 事件监听器
    mergeBtn.addEventListener('click', showPageSelector);

    confirmPageSelection.addEventListener('click', () => {
        pageSelectorModal.style.display = 'none';
        mergePDFs();
    });

    cancelPageSelection.addEventListener('click', () => {
        pageSelectorModal.style.display = 'none';
    });

    closePageSelector.addEventListener('click', () => {
        pageSelectorModal.style.display = 'none';
    });

    selectAllBtn.addEventListener('click', () => {
        pdfFiles.forEach(file => {
            selectedFiles.add(file.name);
        });
        updateFileList();
    });

    clearSelectionBtn.addEventListener('click', () => {
        selectedFiles.clear();
        updateFileList();
    });

    clearAllBtn.addEventListener('click', () => {
        if (confirm('确定要清空文件列表吗？')) {
            pdfFiles = [];
            selectedFiles = new Set();
            filePageCounts = {};
            filePageSelections = {};
            fileInput.value = ''; // 重置文件输入
            updateFileList();
        }
    });

    sortBtn.addEventListener('click', () => {
        sortOptions.style.display = sortOptions.style.display === 'block' ? 'none' : 'block';
    });

    document.querySelectorAll('.sort-option').forEach(option => {
        option.addEventListener('click', () => {
            currentSortMethod = option.dataset.sort;
            sortFiles();
            sortOptions.style.display = 'none';
        });
    });

    document.addEventListener('click', (e) => {
        if (!sortBtn.contains(e.target) && !sortOptions.contains(e.target)) {
            sortOptions.style.display = 'none';
        }
    });

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            updateFileList();
        }, 300);
    });

    helpBtn.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });

    closeHelp.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    closeHelpBtn.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    // 添加关于按钮
    const aboutBtn = document.createElement('button');
    aboutBtn.className = 'btn btn-outline';
    aboutBtn.innerHTML = '<i class="fas fa-info-circle"></i> 关于';
    aboutBtn.style.position = 'absolute';
    aboutBtn.style.top = '20px';
    aboutBtn.style.right = '20px';
    aboutBtn.addEventListener('click', () => {
        aboutModal.style.display = 'flex';
    });
    document.querySelector('.app-container').appendChild(aboutBtn);

    closeAbout.addEventListener('click', () => {
        aboutModal.style.display = 'none';
    });

    closeAboutBtn.addEventListener('click', () => {
        aboutModal.style.display = 'none';
    });

    // 选择文件按钮点击事件
    document.getElementById('select-file-btn').addEventListener('click', function() {
        document.getElementById('file-input').click();
    });

    // 初始化
    updateFileList();
});