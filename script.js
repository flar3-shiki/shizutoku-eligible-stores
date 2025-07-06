// script.js
async function initApp() {
    // --- 1. Load Data ---
    const files = ['stores/aoi.json', 'stores/suruga.json', 'stores/shimizu.json'];
    const chainFile = 'stores/chains.json';
    let shopData = [], chainData = {};
    try {
        const responses = await Promise.all([...files.map(file => fetch(file)), fetch(chainFile)]);
        const jsonData = await Promise.all(responses.map(res => res.json()));
        chainData = jsonData.pop();
        shopData = jsonData.flat();

        // --- Search Performance Improvement ---
        // Pre-calculate normalized search fields to avoid doing it on every keystroke.
        shopData.forEach(shop => {
            shop.searchName = shop.name.normalize('NFKC').toLowerCase();
            shop.searchAddress = (shop.address || '').normalize('NFKC').toLowerCase();
        });

    } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
        document.getElementById('results-container').innerHTML = '<div class="no-results">エラー: データを読み込めませんでした。</div>';
        return;
    }

    // --- 2. Get DOM Elements & Form Creation ---
    const topBarEl = document.querySelector('.top-bar');
    const fabSearch = document.getElementById('fab-search');
    const searchModalOverlay = document.getElementById('search-modal');
    const modalSearchArea = document.getElementById('modal-search-area');
    const noticeModalOverlay = document.getElementById('notice-modal');
    const initialView = document.getElementById('initial-view');
    const resultsArea = document.getElementById('results-area');
    const resultsContainer = document.getElementById('results-container');
    const resultsCountSpan = document.getElementById('results-count');
    const showAllBtn = document.getElementById('show-all-btn');
    const siteNoticeLink = document.getElementById('site-notice-link');
    const settingsLink = document.getElementById('settings-link');
    const settingsModalOverlay = document.getElementById('settings-modal');
    const linkActionSettings = document.getElementById('link-action-settings');
    const themeSettings = document.getElementById('theme-settings');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');
    const resetConfirmModal = document.getElementById('reset-confirm-modal');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');
    const resetSlider = document.getElementById('reset-slider-container');

    const formElements = {};
    const searchState = { term: '', searchTarget: 'both', ward: [], category: [], chain: [] };
    
    const searchTargetFormHTML = `
        <fieldset class="filter-group search-target-group">
            <legend>検索対象</legend>
            <div class="search-target-filter filter-options">
                <label><input type="radio" name="searchTarget" value="both" checked> 両方</label>
                <label><input type="radio" name="searchTarget" value="name"> 店舗名</label>
                <label><input type="radio" name="searchTarget" value="address"> 住所</label>
            </div>
        </fieldset>`;
    const wardFormHTML = `<fieldset class="filter-group"><legend>区で絞り込み</legend><div class="ward-filter filter-options"></div></fieldset>`;
    const catFormHTML = `<fieldset class="filter-group accordion"><legend>業種で絞り込み <span class="accordion-state-text"></span></legend><div class="category-filter filter-options"></div></fieldset>`;
    const chainFormHTML = `<fieldset class="filter-group accordion"><legend>系列店で絞り込み <span class="accordion-state-text"></span></legend><div class="chain-filter filter-options"></div></fieldset>`;

    // Desktop Form
    const topBarMainRow = topBarEl.querySelector('.top-bar-main-row');
    const topBarFiltersContainer = document.createElement('div');
    topBarFiltersContainer.className = 'top-bar-filters';
    topBarEl.querySelector('.top-bar-content').appendChild(topBarFiltersContainer);
    const searchInputDesktop = document.createElement('input');
    searchInputDesktop.id = 'top-bar-search-input';
    searchInputDesktop.className = 'search-input';
    searchInputDesktop.placeholder = '店舗名や住所で検索...';
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-filters-btn';
    toggleBtn.textContent = '絞り込み ▼';
    topBarMainRow.append(searchInputDesktop, toggleBtn);
    const desktopFiltersHTML = `
        <div class="filter-column">
            ${searchTargetFormHTML.replace(/name="searchTarget"/g, 'name="searchTargetDesktop"')}
            ${wardFormHTML}
        </div>
        ${catFormHTML.replace('accordion', '')}
        ${chainFormHTML.replace('accordion', '')}
    `;
    topBarFiltersContainer.innerHTML = desktopFiltersHTML;
    formElements.topbar = { input: searchInputDesktop, searchTargetFilter: topBarFiltersContainer.querySelector('.search-target-filter'), wardFilter: topBarFiltersContainer.querySelector('.ward-filter'), catFilter: topBarFiltersContainer.querySelector('.category-filter'), chainFilter: topBarFiltersContainer.querySelector('.chain-filter') };
    
    // Modal Form
    modalSearchArea.innerHTML = `<input type="text" class="search-input" placeholder="店舗名や住所で検索...">${searchTargetFormHTML.replace(/name="searchTarget"/g, 'name="searchTargetMobile"')}${wardFormHTML}${catFormHTML}${chainFormHTML}`;
    formElements.modal = { input: modalSearchArea.querySelector('.search-input'), searchTargetFilter: modalSearchArea.querySelector('.search-target-filter'), wardFilter: modalSearchArea.querySelector('.ward-filter'), catFieldset: modalSearchArea.querySelectorAll('.accordion')[0], catFilter: modalSearchArea.querySelector('.category-filter'), chainFieldset: modalSearchArea.querySelectorAll('.accordion')[1], chainFilter: modalSearchArea.querySelector('.chain-filter') };

    function syncStateFrom(form) {
        searchState.term = form.input.value;
        if (form.searchTargetFilter) {
            const checkedRadio = form.searchTargetFilter.querySelector('input:checked');
            if (checkedRadio) { // Check if a radio button is actually checked
                searchState.searchTarget = checkedRadio.value;
            }
        }
        searchState.ward = form.wardFilter ? [...form.wardFilter.querySelectorAll('input:checked')].map(cb => cb.value) : [];
        searchState.category = form.catFilter ? [...form.catFilter.querySelectorAll('input:checked')].map(cb => cb.value) : [];
        searchState.chain = form.chainFilter ? [...form.chainFilter.querySelectorAll('input:checked')].map(cb => cb.value) : [];
    }
    
    function syncFormsFromState() {
        Object.values(formElements).forEach(form => {
            form.input.value = searchState.term;
            if (form.searchTargetFilter) {
                form.searchTargetFilter.querySelector(`input[value="${searchState.searchTarget}"]`).checked = true;
            }
            if (form.wardFilter) form.wardFilter.querySelectorAll('input').forEach(cb => cb.checked = searchState.ward.includes(cb.value));
            if (form.catFilter) form.catFilter.querySelectorAll('input').forEach(cb => cb.checked = searchState.category.includes(cb.value));
            if (form.chainFilter) form.chainFilter.querySelectorAll('input').forEach(cb => cb.checked = searchState.chain.includes(cb.value));
        });
    }

    function renderResults() {
        const searchTerm = searchState.term.trim().toLowerCase();
        const selectedChainsWithAliases = searchState.chain.flatMap(chainName => {
            for (const category in chainData) {
                const found = chainData[category].find(c => c.name === chainName);
                if (found) return [found.name, ...found.aliases];
            }
            return [];
        });

        const filteredShops = shopData.filter(shop => {
            const normalizedSearchTerm = searchTerm.normalize('NFKC');
            
            let textMatch = false;
            if (normalizedSearchTerm) {
                switch (searchState.searchTarget) {
                    case 'address':
                        textMatch = shop.searchAddress.includes(normalizedSearchTerm);
                        break;
                    case 'both':
                        textMatch = shop.searchName.includes(normalizedSearchTerm) || shop.searchAddress.includes(normalizedSearchTerm);
                        break;
                    case 'name':
                    default:
                        textMatch = shop.searchName.includes(normalizedSearchTerm);
                        break;
                }
            } else {
                textMatch = true;
            }

            const chainMatch = selectedChainsWithAliases.length === 0 || selectedChainsWithAliases.some(chain => shop.name.normalize('NFKC').toLowerCase().startsWith(chain.toLowerCase()));
            
            return textMatch &&
                   (searchState.ward.length === 0 || searchState.ward.includes(shop.ward)) &&
                   (searchState.category.length === 0 || searchState.category.includes(shop.category)) &&
                   chainMatch;
        });
        
        resultsContainer.innerHTML = '';
        if (filteredShops.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">該当する店舗が見つかりませんでした。</div>';
        } else {
            const currentLinkAction = localStorage.getItem('linkAction') || 'map_address';

            filteredShops.forEach(shop => {
                const shopCard = document.createElement('div');
                shopCard.className = 'shop-card';
                
                let nameElement = '';
                switch (currentLinkAction) {
                    case 'map_address':
                        const mapQuery = encodeURIComponent(shop.address || `${shop.name} 静岡市 ${shop.ward}`);
                        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                        nameElement = `<a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="shop-name">${shop.name}</a>`;
                        break;
                    case 'google_search':
                        const searchQuery = encodeURIComponent(`${shop.name} 静岡市 ${shop.ward}`);
                        const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
                        nameElement = `<a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="shop-name">${shop.name}</a>`;
                        break;
                    case 'none':
                        nameElement = `<span class="shop-name-no-link">${shop.name}</span>`;
                        break;
                }

                shopCard.innerHTML = `
                    ${nameElement}
                    <p class="shop-address">${shop.address || '住所情報なし'}</p>
                    <div class="shop-info">
                        <span>${shop.ward}</span>
                        <span>${shop.category}</span>
                    </div>
                `;
                resultsContainer.appendChild(shopCard);
            });
        }
        resultsCountSpan.textContent = `${filteredShops.length}件見つかりました`;
    }

    // --- 4. Initial UI Population & Event Listeners ---
    const wards = [...new Set(shopData.map(shop => shop.ward))].sort();
    const categories = [...new Set(shopData.map(shop => shop.category))].sort();
    
    function createCheckboxes(container, items) { if (!container) return; container.innerHTML = ''; items.forEach(item => { const label = document.createElement('label'); label.innerHTML = `<input type="checkbox" value="${item}"> ${item}`; container.appendChild(label); });}
    
    function createChainCheckboxes(container) {
        if (!container) return;
        container.innerHTML = '';
        Object.entries(chainData).forEach(([category, chains], index) => {
            if (index > 0) container.appendChild(document.createElement('hr'));
            const categoryTitle = document.createElement('div');
            categoryTitle.className = 'filter-category-title';
            categoryTitle.textContent = category;
            container.appendChild(categoryTitle);
            chains.forEach(chain => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${chain.name}"> ${chain.name}`;
                container.appendChild(label);
            });
        });
    }

    Object.values(formElements).forEach(elements => {
        createCheckboxes(elements.wardFilter, wards);
        createCheckboxes(elements.catFilter, categories);
        createChainCheckboxes(elements.chainFilter);
    });

    let isInitial = true;
    function activateSearch() { if (!isInitial) return; isInitial = false; initialView.style.display = 'none'; resultsArea.style.display = 'block'; }

    Object.values(formElements).forEach(elements => {
        const handler = () => { if(isInitial) { activateSearch(); } syncStateFrom(elements); syncFormsFromState(); renderResults(); };
        elements.input.addEventListener('input', handler);
        if (elements.searchTargetFilter) elements.searchTargetFilter.addEventListener('change', handler);
        if (elements.wardFilter) elements.wardFilter.addEventListener('change', handler);
        if (elements.catFilter) elements.catFilter.addEventListener('change', handler);
        if (elements.chainFilter) elements.chainFilter.addEventListener('change', handler);
    });
    
    showAllBtn.addEventListener('click', () => { activateSearch(); renderResults(); });

    function setupAccordion(fieldset) { if (!fieldset) return;
        const legend = fieldset.querySelector('legend'); const textSpan = legend.querySelector('.accordion-state-text');
        function updateAccordionUI() {
            const isMobile = window.innerWidth <= 1024;
            if (fieldset.classList.contains('search-target-group')) return;
            if (isMobile) { if (textSpan) textSpan.textContent = fieldset.classList.contains('is-open') ? '(タップで閉じる)' : '(タップで開く)'; }
            else { if (textSpan) textSpan.textContent = ''; fieldset.classList.remove('is-open'); }
        }
        legend.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT' && window.innerWidth <= 1024) { fieldset.classList.toggle('is-open'); updateAccordionUI(); } });
        window.addEventListener('resize', updateAccordionUI); updateAccordionUI();
    }
    setupAccordion(modalSearchArea.querySelector('.search-target-group'));
    setupAccordion(formElements.modal.catFieldset);
    setupAccordion(formElements.modal.chainFieldset);
    
    function updateBodyPadding() { if(window.innerWidth > 1024) document.body.style.paddingTop = topBarEl.offsetHeight + 'px'; }
    
    toggleBtn.addEventListener('click', () => { topBarEl.classList.toggle('is-expanded'); toggleBtn.textContent = topBarEl.classList.contains('is-expanded') ? '閉じる ▲' : '絞り込み ▼'; topBarFiltersContainer.addEventListener('transitionend', updateBodyPadding, { once: true }); updateBodyPadding(); });
    
    fabSearch.addEventListener('click', () => { 
        activateSearch(); 
        syncFormsFromState(); 
        searchModalOverlay.classList.add('is-open'); 
        document.body.classList.add('modal-open'); 
        formElements.modal.input.focus(); 
    });

    // === MODAL REFACTOR START ===
    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('is-open');
        // Only remove body class if no other modals are open
        if (document.querySelectorAll('.modal-overlay.is-open').length === 1) {
            document.body.classList.remove('modal-open');
        }
    }

    function openNoticeModal() {
        noticeModalOverlay.classList.add('is-open');
        document.body.classList.add('modal-open');
    }

    function closeNoticeModal() {
        noticeModalOverlay.classList.remove('is-open');
        document.body.classList.remove('modal-open');
    }

    function openSettingsModal() {
        settingsModalOverlay.classList.add('is-open');
        document.body.classList.add('modal-open');
    }

    function closeSettingsModal() {
        settingsModalOverlay.classList.remove('is-open');
        document.body.classList.remove('modal-open');
    }
    // === MODAL REFACTOR END ===
    
    siteNoticeLink.addEventListener('click', openNoticeModal);
    settingsLink.addEventListener('click', openSettingsModal);

    // --- Settings Logic ---
    function applyAndSaveLinkAction(action) {
        localStorage.setItem('linkAction', action);
        // Immediately re-render results to apply the new setting
        if (!isInitial) {
            renderResults();
        }
    }

    linkActionSettings.addEventListener('change', (e) => {
        if (e.target.name === 'linkAction') {
            applyAndSaveLinkAction(e.target.value);
        }
    });

    // Load initial setting on startup
    const savedLinkAction = localStorage.getItem('linkAction') || 'map_address';
    linkActionSettings.querySelector(`input[value="${savedLinkAction}"]`).checked = true;

    // --- Theme Logic ---
    function applyAndSaveTheme(theme) {
        localStorage.setItem('theme', theme);
        if (theme === 'system') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    themeSettings.addEventListener('change', (e) => {
        if (e.target.name === 'theme') {
            applyAndSaveTheme(e.target.value);
        }
    });

    // Load initial theme on startup
    const savedTheme = localStorage.getItem('theme') || 'system';
    themeSettings.querySelector(`input[value="${savedTheme}"]`).checked = true;
    applyAndSaveTheme(savedTheme); // Apply theme on initial load

    // --- Reset Logic ---
    function openResetConfirmModal() {
        closeModal(settingsModalOverlay); // Close settings modal first
        document.querySelector('.main-wrapper').classList.add('is-blurred');
        resetConfirmModal.classList.add('is-open');
    }

    function closeResetConfirmModal() {
        if (resetConfirmModal.dataset.unclosable === 'true') return; // Don't close if processing
        document.querySelector('.main-wrapper').classList.remove('is-blurred');
        resetConfirmModal.classList.remove('is-open');
        // Reset slider state if cancelled
        knob.style.transform = 'translateX(0px)'; 
        sliderText.style.opacity = 1;
    }

    resetSettingsBtn.addEventListener('click', openResetConfirmModal);
    cancelResetBtn.addEventListener('click', closeResetConfirmModal);

    // Slider Logic
    const knob = resetSlider.querySelector('.slider-knob');
    const track = resetSlider.querySelector('.slider-track');
    const sliderText = resetSlider.querySelector('.slider-text');
    let isDragging = false;

    function moveSlider(clientX) {
        if (!isDragging) return;
        const rect = track.getBoundingClientRect();
        const max = rect.width - knob.offsetWidth - 10; // 10 = 5px padding on each side
        let x = clientX - rect.left - (knob.offsetWidth / 2);
        x = Math.max(0, Math.min(x, max));
        knob.style.transform = `translateX(${x}px)`;
        sliderText.style.opacity = 1 - (x / max) * 2;

        if (x >= max - 1) { // Reached the end
            isDragging = false;
            resetConfirmModal.classList.add('is-processing');
            document.getElementById('reset-message').textContent = 'リセットしています...';

            // Make modal unclosable during processing
            resetConfirmModal.dataset.unclosable = 'true';

            setTimeout(() => {
                localStorage.removeItem('linkAction');
                localStorage.removeItem('theme');
                localStorage.removeItem('shizuTokuNoticeViewed');
                document.getElementById('reset-message').textContent = 'リセットが完了しました。ページをリロードします。';
                
                setTimeout(() => {
                    window.location.reload();
                }, 1500); // Wait a bit after showing the final message

            }, 3000); // Wait 3 seconds
        }
    }

    knob.addEventListener('mousedown', () => { isDragging = true; knob.style.cursor = 'grabbing'; });
    knob.addEventListener('touchstart', () => { isDragging = true; }, { passive: true });

    window.addEventListener('mouseup', () => { if(isDragging) { isDragging = false; knob.style.cursor = 'grab'; knob.style.transform = 'translateX(0px)'; sliderText.style.opacity = 1; } });
    window.addEventListener('touchend', () => { if(isDragging) { isDragging = false; knob.style.transform = 'translateX(0px)'; sliderText.style.opacity = 1; } });

    window.addEventListener('mousemove', (e) => moveSlider(e.clientX));
    window.addEventListener('touchmove', (e) => moveSlider(e.touches[0].clientX));
    
    // 初回訪問時に注意モーダルを開く
    if (!localStorage.getItem('shizuTokuNoticeViewed')) {
        openNoticeModal();
        localStorage.setItem('shizuTokuNoticeViewed', 'true');
    }
    
    // イベント委任を使って、すべてのモーダル関連のクリックを処理
    document.addEventListener('click', (e) => {
        // クリックされたのが「閉じるボタン」(.modal-close-btn) の場合
        const closeButton = e.target.closest('.modal-close-btn');
        if (closeButton) {
            const modal = closeButton.closest('.modal-overlay');
            if (modal) closeModal(modal);
            return;
        }

        // クリックされたのがモーダルの外側（オーバーレイ自身）の場合
        if (e.target.matches('.modal-overlay.is-open')) {
            // Reset confirm modal has its own close logic, don't close it here
            if (e.target.id !== 'reset-confirm-modal') {
                closeModal(e.target);
            }
        }
    });

    window.addEventListener('resize', () => document.body.style.paddingTop = window.innerWidth > 1024 ? topBarEl.offsetHeight + 'px' : '0');
    document.body.style.paddingTop = window.innerWidth > 1024 ? topBarEl.offsetHeight + 'px' : '0';
}
document.addEventListener('DOMContentLoaded', initApp);