async function initApp() {
    // --- 1. Load Data ---
    const files = ['stores/aoi.json', 'stores/suruga.json', 'stores/shimizu.json'];
    let shopData = [];
    try {
        const responses = await Promise.all(files.map(file => fetch(file)));
        const jsonData = await Promise.all(responses.map(res => res.json()));
        shopData = jsonData.flat();
    } catch (error) {
        console.error("店舗データの読み込みに失敗しました:", error);
        document.getElementById('results-container').innerHTML = '<div class="no-results">エラー: 店舗データを読み込めませんでした。ローカルサーバーで実行しているか確認してください。</div>';
        return;
    }

    // --- 2. Get DOM Elements ---
    const topBarEl = document.querySelector('.top-bar');
    const fabSearch = document.getElementById('fab-search');
    const searchModalOverlay = document.getElementById('search-modal');
    const modalSearchArea = document.getElementById('modal-search-area');
    const searchModalCloseBtn = searchModalOverlay.querySelector('.modal-close-btn');
    const noticeModalOverlay = document.getElementById('notice-modal');
    const noticeModalCloseBtn = noticeModalOverlay.querySelector('.modal-close-btn');
    const initialView = document.getElementById('initial-view');
    const resultsArea = document.getElementById('results-area');
    const resultsContainer = document.getElementById('results-container');
    const resultsCountSpan = document.getElementById('results-count');
    const showAllBtn = document.getElementById('show-all-btn');
    const siteNoticeLink = document.getElementById('site-notice-link');

    // --- 3. Form Creation & State ---
    const formElements = {};
    const searchState = { term: '', ward: [], category: [] };

    const wardFormHTML = `<fieldset class="filter-group"><legend>区で絞り込み</legend><div class="ward-filter filter-options"></div></fieldset>`;
    const catFormHTML = `<fieldset class="filter-group accordion"><legend>業種で絞り込み <span class="accordion-state-text"></span></legend><div class="category-filter filter-options"></div></fieldset>`;

    // Desktop Form
    const topBarMainRow = topBarEl.querySelector('.top-bar-main-row');
    const topBarFiltersContainer = document.createElement('div');
    topBarFiltersContainer.className = 'top-bar-filters';
    topBarEl.querySelector('.top-bar-content').appendChild(topBarFiltersContainer);
    const searchInputDesktop = document.createElement('input');
    searchInputDesktop.id = 'top-bar-search-input';
    searchInputDesktop.className = 'search-input';
    searchInputDesktop.placeholder = '店舗名で検索...';
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggle-filters-btn';
    toggleBtn.textContent = '絞り込み ▼';
    topBarMainRow.append(searchInputDesktop, toggleBtn);
    topBarFiltersContainer.innerHTML = wardFormHTML + catFormHTML;
    formElements.topbar = { input: searchInputDesktop, wardFilter: topBarFiltersContainer.querySelector('.ward-filter'), catFilter: topBarFiltersContainer.querySelector('.category-filter') };
    
    // Modal Form
    modalSearchArea.innerHTML = `<input type="text" class="search-input" placeholder="店舗名で検索...">${wardFormHTML}${catFormHTML}`;
    formElements.modal = { input: modalSearchArea.querySelector('.search-input'), wardFilter: modalSearchArea.querySelector('.ward-filter'), catFieldset: modalSearchArea.querySelector('.accordion'), catFilter: modalSearchArea.querySelector('.category-filter') };

    // --- 4. Sync & Render Logic ---
    function syncStateFrom(form) {
        searchState.term = form.input.value;
        searchState.ward = form.wardFilter ? [...form.wardFilter.querySelectorAll('input:checked')].map(cb => cb.value) : [];
        searchState.category = form.catFilter ? [...form.catFilter.querySelectorAll('input:checked')].map(cb => cb.value) : [];
    }
    function syncFormsFromState() {
        Object.values(formElements).forEach(form => {
            form.input.value = searchState.term;
            if (form.wardFilter) form.wardFilter.querySelectorAll('input').forEach(cb => cb.checked = searchState.ward.includes(cb.value));
            if (form.catFilter) form.catFilter.querySelectorAll('input').forEach(cb => cb.checked = searchState.category.includes(cb.value));
        });
    }

    function renderResults() {
        const searchTerm = searchState.term.trim().toLowerCase();
        const filteredShops = shopData.filter(shop => {
            const normalizedShopName = shop.name.normalize('NFKC').toLowerCase();
            const normalizedSearchTerm = searchTerm.normalize('NFKC');
            return normalizedShopName.includes(normalizedSearchTerm) && (searchState.ward.length === 0 || searchState.ward.includes(shop.ward)) && (searchState.category.length === 0 || searchState.category.includes(shop.category));
        });
        resultsContainer.innerHTML = '';
        if (filteredShops.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">該当する店舗が見つかりませんでした。</div>';
        } else {
            filteredShops.forEach(shop => {
                const shopCard = document.createElement('div');
                shopCard.className = 'shop-card';
                const searchQuery = encodeURIComponent(`${shop.name} 静岡市 ${shop.ward}`);
                shopCard.innerHTML = `<a href="https://www.google.com/search?q=${searchQuery}" target="_blank" rel="noopener noreferrer" class="shop-name">${shop.name}</a><div class="shop-info"><span>${shop.ward}</span><span>${shop.category}</span></div>`;
                resultsContainer.appendChild(shopCard);
            });
        }
        resultsCountSpan.textContent = `${filteredShops.length}件見つかりました`;
    }

    // --- 5. Initial UI Population & Event Listeners ---
    const wards = [...new Set(shopData.map(shop => shop.ward))].sort();
    const categories = [...new Set(shopData.map(shop => shop.category))].sort();
    
    function createCheckboxes(container, items) {
        if (!container) return;
        container.innerHTML = '';
        items.forEach(item => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${item}"> ${item}`;
            container.appendChild(label);
        });
    }
    
    Object.values(formElements).forEach(elements => {
        createCheckboxes(elements.wardFilter, wards);
        createCheckboxes(elements.catFilter, categories);
    });

    let isInitial = true;
    function activateSearch() {
        if (!isInitial) return;
        isInitial = false;
        initialView.style.display = 'none';
        resultsArea.style.display = 'block';
    }

    Object.values(formElements).forEach(elements => {
        const handler = () => {
            if (isInitial) {
                activateSearch();
            }
            syncStateFrom(elements);
            syncFormsFromState();
            renderResults();
        };
        elements.input.addEventListener('input', handler);
        if (elements.wardFilter) elements.wardFilter.addEventListener('change', handler);
        if (elements.catFilter) elements.catFilter.addEventListener('change', handler);
    });
    
    showAllBtn.addEventListener('click', () => {
        activateSearch();
        renderResults();
    });

    function setupAccordion(fieldset) {
        if (!fieldset) return;
        const legend = fieldset.querySelector('legend');
        const textSpan = legend.querySelector('.accordion-state-text');
        function updateAccordionUI() {
            const isMobile = window.innerWidth <= 1024;
            if (isMobile) {
                if (textSpan) textSpan.textContent = fieldset.classList.contains('is-open') ? '(タップで閉じる)' : '(タップで開く)';
            } else {
                if (textSpan) textSpan.textContent = '';
                fieldset.classList.remove('is-open');
            }
        }
        legend.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && window.innerWidth <= 1024) {
                fieldset.classList.toggle('is-open');
                updateAccordionUI();
            }
        });
        window.addEventListener('resize', updateAccordionUI);
        updateAccordionUI();
    }
    setupAccordion(formElements.modal.catFieldset);
    
    function updateBodyPadding() {
        if (window.innerWidth > 1024) {
            document.body.style.paddingTop = topBarEl.offsetHeight + 'px';
        }
    }
    
    toggleBtn.addEventListener('click', () => {
        topBarEl.classList.toggle('is-expanded');
        toggleBtn.textContent = topBarEl.classList.contains('is-expanded') ? '閉じる ▲' : '絞り込み ▼';
        topBarFiltersContainer.addEventListener('transitionend', updateBodyPadding, { once: true });
        updateBodyPadding();
    });
    
    const h1Observer = new IntersectionObserver(entries => {
        fabSearch.classList.toggle('is-visible', window.innerWidth <= 1024 && entries[0].boundingClientRect.bottom < 0);
    }, { threshold: [0] });
    h1Observer.observe(topBarEl.querySelector('h1'));

    fabSearch.addEventListener('click', () => {
        activateSearch();
        syncFormsFromState();
        searchModalOverlay.classList.add('is-visible');
        document.body.classList.add('modal-open');
        formElements.modal.input.focus();
    });

    function closeSearchModal() {
        searchModalOverlay.classList.remove('is-visible');
        document.body.classList.remove('modal-open');
    }
    searchModalCloseBtn.addEventListener('click', closeSearchModal);
    searchModalOverlay.addEventListener('click', (e) => {
        if (e.target === searchModalOverlay) closeSearchModal();
    });

    function openNoticeModal() {
        noticeModalOverlay.classList.add('is-visible');
        document.body.classList.add('modal-open');
    }
    function closeNoticeModal() {
        noticeModalOverlay.classList.remove('is-visible');
        document.body.classList.remove('modal-open');
    }
    siteNoticeLink.addEventListener('click', openNoticeModal);
    noticeModalCloseBtn.addEventListener('click', closeNoticeModal);

    if (!localStorage.getItem('shizuTokuNoticeViewed')) {
        openNoticeModal();
        localStorage.setItem('shizuTokuNoticeViewed', 'true');
    }
    
    window.addEventListener('resize', () => {
        document.body.style.paddingTop = window.innerWidth > 1024 ? topBarEl.offsetHeight + 'px' : '0';
    });
    
    // --- 6. Initial Setup ---
    document.body.style.paddingTop = window.innerWidth > 1024 ? topBarEl.offsetHeight + 'px' : '0';
}

document.addEventListener('DOMContentLoaded', initApp);