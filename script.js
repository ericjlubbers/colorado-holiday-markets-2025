// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    SHEET_ID: '1OsQDhJXLwKmnybwNePIhnvgf2nrWH1E_8mv1NWc_ESw',
    MAP_CENTER: [39.0, -105.5],
    MAP_ZOOM: 7,
    MAP_TILE_PROVIDER: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png',
    MAP_ATTRIBUTION: '',
    // Direct export URL - no proxy needed
    CSV_URL_TEMPLATE: 'https://docs.google.com/spreadsheets/d/{sheetId}/export?format=csv&gid=0'
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
    markets: [],
    filteredMarkets: [],
    selectedMarket: null,
    map: null,
    markers: {},
    currentFilters: {
        search: '',
        region: '',
        cost: '',
        dateFilter: ''
    },
    today: new Date(),
    tomorrow: new Date(Date.now() + 86400000),
    weekendStart: null,
    weekendEnd: null
};

// Calculate weekend dates
function calculateWeekendDates() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
    state.weekendStart = new Date(today.getTime() + daysUntilSaturday * 86400000);
    state.weekendEnd = new Date(state.weekendStart.getTime() + 86400000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎄 Colorado Holiday Markets - Initializing...');
    calculateWeekendDates();
    initializeMap();
    fetchAndProcessData();
    setupEventListeners();
    console.log('✅ Initialization complete');
});

// ============================================================================
// MAP INITIALIZATION
// ============================================================================

function initializeMap() {
    console.log('🗺️  Initializing Leaflet map...');
    try {
        state.map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
        
        L.tileLayer(CONFIG.MAP_TILE_PROVIDER, {
            attribution: CONFIG.MAP_ATTRIBUTION,
            maxZoom: 18,
            minZoom: 5
        }).addTo(state.map);
        
        console.log('✅ Map initialized');
    } catch (error) {
        console.error('❌ Error initializing map:', error);
    }
}

// ============================================================================
// DATA FETCHING AND PROCESSING
// ============================================================================

async function fetchAndProcessData() {
    try {
        showLoading('Fetching markets data...');
        console.log('📡 Fetching data from Google Sheet...');
        
        const csvUrl = CONFIG.CSV_URL_TEMPLATE.replace('{sheetId}', CONFIG.SHEET_ID);
        console.log('CSV URL:', csvUrl);
        
        // Use fetch with no-cors mode to work around CORS restrictions
        const response = await fetch(csvUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/csv'
            }
        });
        
        console.log('📥 Fetch response status:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status}`);
        }
        
        const csv = await response.text();
        console.log('✅ CSV data received, length:', csv.length, 'characters');
        
        // Check if we got valid CSV data
        if (!csv || csv.includes('<!DOCTYPE') || csv.includes('<html')) {
            console.error('❌ Received HTML instead of CSV - likely a redirect or auth page');
            throw new Error('Google Sheets returned HTML instead of CSV. Make sure the sheet is publicly accessible.');
        }
        
        state.markets = parseCSV(csv);
        console.log(`✅ Parsed ${state.markets.length} markets`);
        
        if (state.markets.length > 0) {
            console.log('📍 First market:', state.markets[0]);
        }
        
        populateRegionFilter();
        updateDisplay();
        
    } catch (error) {
        console.error('❌ Error fetching data:', error);
        showError('Unable to load market data. Please refresh the page. If the error persists, ensure the Google Sheet is publicly accessible (View Only).');
    }
}

function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = parseCSVLine(lines[0]);
    const markets = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        
        if (values.length < 3 || !values[0].trim()) continue;
        
        const market = {
            name: values[0]?.trim() || '',
            lat: parseFloat(values[1]) || null,
            lon: parseFloat(values[2]) || null,
            region: values[3]?.trim() || 'Unknown',
            zipCode: values[4]?.trim() || '',
            address: values[5]?.trim() || '',
            date: values[6]?.trim() || '',
            cost: values[7]?.trim() || 'Free',
            website: values[8]?.trim() || '',
            description: values[9]?.trim() || ''
        };
        
        if (market.lat !== null && market.lon !== null) {
            market.dates = parseMarketDates(market.date);
            markets.push(market);
        }
    }
    
    return markets;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
}

function parseMarketDates(dateString) {
    // Parse date strings like "Dec. 13-14" or "Nov. 21-Dec. 23"
    const dates = [];
    const monthMap = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    try {
        // Extract date ranges
        const parts = dateString.toLowerCase().split(/and|,/).map(p => p.trim());
        
        for (const part of parts) {
            const dayMatch = part.match(/(\d+)/g);
            const monthMatch = part.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
            
            if (dayMatch && monthMatch) {
                const month = monthMap[monthMatch[0].substring(0, 3).toLowerCase()];
                const startDay = parseInt(dayMatch[0]);
                const endDay = dayMatch[1] ? parseInt(dayMatch[1]) : startDay;
                
                // Create dates in Nov/Dec 2025
                const year = month === 10 || month === 11 ? 2025 : 2025;
                
                for (let day = startDay; day <= endDay; day++) {
                    dates.push(new Date(year, month, day));
                }
            }
        }
    } catch (e) {
        console.warn('Could not parse dates:', dateString);
    }
    
    return dates;
}

// ============================================================================
// FILTERING AND DISPLAY
// ============================================================================

function updateDisplay() {
    applyFilters();
    renderMarkers();
    renderTable();
    updateResultsCount();
}

function applyFilters() {
    state.filteredMarkets = state.markets.filter(market => {
        const matchesSearch = 
            market.name.toLowerCase().includes(state.currentFilters.search.toLowerCase()) ||
            market.address.toLowerCase().includes(state.currentFilters.search.toLowerCase()) ||
            market.description.toLowerCase().includes(state.currentFilters.search.toLowerCase());
        
        const matchesRegion = 
            !state.currentFilters.region || 
            market.region === state.currentFilters.region;
        
        let matchesDate = true;
        if (state.currentFilters.dateFilter) {
            matchesDate = marketIsOpenOnDate(market, state.currentFilters.dateFilter);
        }
        
        return matchesSearch && matchesRegion && matchesDate;
    });
}

function marketIsOpenOnDate(market, dateFilter) {
    if (!market.dates || market.dates.length === 0) return true;
    
    let targetDate;
    if (dateFilter === 'today') {
        targetDate = new Date(state.today.getFullYear(), state.today.getMonth(), state.today.getDate());
    } else if (dateFilter === 'tomorrow') {
        targetDate = new Date(state.tomorrow.getFullYear(), state.tomorrow.getMonth(), state.tomorrow.getDate());
    } else if (dateFilter === 'weekend') {
        const dates = [];
        for (let d = new Date(state.weekendStart); d <= state.weekendEnd; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
        }
        return dates.some(d => market.dates.some(md => 
            md.getFullYear() === d.getFullYear() && 
            md.getMonth() === d.getMonth() && 
            md.getDate() === d.getDate()
        ));
    }
    
    return market.dates.some(d => 
        d.getFullYear() === targetDate.getFullYear() && 
        d.getMonth() === targetDate.getMonth() && 
        d.getDate() === targetDate.getDate()
    );
}

function renderMarkers() {
    Object.values(state.markers).forEach(m => state.map.removeLayer(m.marker));
    state.markers = {};
    
    state.filteredMarkets.forEach(market => {
        const marker = L.marker(
            [market.lat, market.lon],
            {
                icon: createCustomIcon(market === state.selectedMarket),
                title: market.name
            }
        ).addTo(state.map);
        
        marker.on('click', () => selectMarket(market));
        state.markers[market.name] = { marker, market };
    });
    
    console.log('✅ Rendered', Object.keys(state.markers).length, 'markers');
}

function createCustomIcon(isActive = false) {
    const html = `<div class="market-marker ${isActive ? 'active' : ''}">❄️</div>`;
    return L.divIcon({
        html: html,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
}

function renderTable() {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = '';
    
    if (state.filteredMarkets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="no-results">No markets found</td></tr>';
        return;
    }
    
    state.filteredMarkets.forEach(market => {
        const row = document.createElement('tr');
        row.className = market === state.selectedMarket ? 'active' : '';
        row.innerHTML = `
            <td>${market.name}</td>
            <td>${market.date}</td>
            <td>${market.region}</td>
        `;
        row.addEventListener('click', () => selectMarket(market));
        tbody.appendChild(row);
    });
}

function updateResultsCount() {
    document.getElementById('resultsCount').textContent = state.filteredMarkets.length;
}

function populateRegionFilter() {
    const regions = [...new Set(state.markets.map(m => m.region))].sort();
    const select = document.getElementById('regionFilter');
    
    regions.forEach(region => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        select.appendChild(option);
    });
}

// ============================================================================
// MARKET SELECTION AND DETAILS
// ============================================================================

function selectMarket(market) {
    console.log('📍 Selecting market:', market.name);
    state.selectedMarket = market;
    
    renderMarkers();
    state.map.setView([market.lat, market.lon], 12, { animate: true });
    
    document.querySelectorAll('#resultsTable tbody tr').forEach(row => {
        row.classList.remove('active');
        if (row.cells[0].textContent === market.name) {
            row.classList.add('active');
        }
    });
    
    showDetails(market);
}

function showDetails(market) {
    const overlay = document.getElementById('modalOverlay');
    const panel = document.getElementById('detailsPanel');
    
    // Update title
    document.getElementById('detailsTitle').textContent = market.name;
    
    // Build calendar
    const calendar = generateCalendar(market.dates || []);
    
    // Build content with new layout
    const html = `
        <!-- Header row with date, cost, region -->
        <div class="details-header-row">
            <div class="details-quick-info">
                <span class="details-quick-info-label">Date</span>
                <span class="details-quick-info-value">${market.date}</span>
            </div>
            <div class="details-quick-info">
                <span class="details-quick-info-label">Cost</span>
                <span class="details-quick-info-value">${market.cost}</span>
            </div>
            <div class="details-quick-info">
                <span class="details-quick-info-label">Region</span>
                <span class="details-quick-info-value">${market.region}</span>
            </div>
        </div>
        
        <!-- Body row with description and location -->
        <div class="details-body-row">
            <div class="details-field">
                <span class="details-field-label">Description</span>
                <div class="details-field-value">
                    ${market.description}
                    ${market.website ? `<div style="margin-top: var(--spacing-md);"><a href="${market.website}" target="_blank" rel="noopener noreferrer" class="visit-website-btn">Visit Website</a></div>` : ''}
                </div>
            </div>
            <div class="details-field">
                <span class="details-field-label">Location</span>
                <div class="details-field-value">
                    ${market.address}<br>
                    <span style="font-size: 0.875rem; opacity: 0.8;">Zip: ${market.zipCode}</span>
                </div>
            </div>
        </div>
        
        <!-- Calendar -->
        ${calendar}
    `;
    
    document.getElementById('detailsContent').innerHTML = html;
    overlay.classList.add('open');
    panel.classList.add('open');
}

function generateCalendar(marketDates) {
    const calendarHTML = `
        <div class="date-calendar">
            <div class="calendar-title">November & December 2025</div>
            <div class="calendar-months">
                ${generateMonthCalendar(10, marketDates)}
                ${generateMonthCalendar(11, marketDates)}
            </div>
        </div>
    `;
    return calendarHTML;
}

function generateMonthCalendar(month, marketDates) {
    const monthNames = ['November', 'December'];
    const year = 2025;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    let html = `<div class="month-calendar">`;
    html += `<div class="month-name">${monthNames[month === 10 ? 0 : 1]}</div>`;
    html += `<div class="calendar-grid">`;
    
    const dayHeaders = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dayHeaders.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    let currentDate = new Date(startDate);
    const monthEnd = new Date(year, month + 1, 0);
    
    while (currentDate <= monthEnd || currentDate.getDay() !== 0) {
        const classes = [];
        
        if (currentDate.getMonth() !== month) {
            classes.push('other-month');
        }
        
        // Highlight market dates
        const isMarketDate = marketDates.some(d => 
            d.getFullYear() === currentDate.getFullYear() && 
            d.getMonth() === currentDate.getMonth() && 
            d.getDate() === currentDate.getDate()
        );
        
        if (isMarketDate) {
            classes.push('highlight');
        }
        
        // Highlight today
        if (currentDate.toDateString() === state.today.toDateString()) {
            classes.push('today');
        }
        
        html += `<div class="calendar-day ${classes.join(' ')}">${currentDate.getDate()}</div>`;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    html += `</div></div>`;
    return html;
}

function closeDetails() {
    console.log('❌ Closing details');
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('detailsPanel').classList.remove('open');
    state.selectedMarket = null;
    renderMarkers();
    document.querySelectorAll('#resultsTable tbody tr').forEach(row => {
        row.classList.remove('active');
    });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    console.log('⚙️  Setting up event listeners...');
    
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.currentFilters.search = e.target.value;
        updateDisplay();
    });
    
    // Region filter
    document.getElementById('regionFilter').addEventListener('change', (e) => {
        state.currentFilters.region = e.target.value;
        updateDisplay();
    });
    
    // Quick filters
    document.getElementById('todayBtn').addEventListener('click', () => {
        toggleQuickFilter('today', document.getElementById('todayBtn'));
    });
    
    document.getElementById('tomorrowBtn').addEventListener('click', () => {
        toggleQuickFilter('tomorrow', document.getElementById('tomorrowBtn'));
    });
    
    document.getElementById('weekendBtn').addEventListener('click', () => {
        toggleQuickFilter('weekend', document.getElementById('weekendBtn'));
    });
    
    // Close modal
    document.getElementById('closeDetailsBtn').addEventListener('click', closeDetails);
    document.getElementById('modalOverlay').addEventListener('click', closeDetails);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDetails();
    });
    
    console.log('✅ Event listeners set up');
}

function toggleQuickFilter(filter, button) {
    if (state.currentFilters.dateFilter === filter) {
        state.currentFilters.dateFilter = '';
        button.classList.remove('active');
    } else {
        // Deactivate others
        document.querySelectorAll('.quick-filter-btn').forEach(btn => btn.classList.remove('active'));
        
        state.currentFilters.dateFilter = filter;
        button.classList.add('active');
    }
    updateDisplay();
}

// ============================================================================
// UI HELPERS
// ============================================================================

function showLoading(message) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = `<tr><td colspan="3" class="loading">${message}</td></tr>`;
}

function showError(message) {
    const tbody = document.getElementById('resultsTableBody');
    tbody.innerHTML = `<tr><td colspan="3" class="no-results">${message}</td></tr>`;
}