// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    SHEET_ID: '1OsQDhJXLwKmnybwNePIhnvgf2nrWH1E_8mv1NWc_ESw',
    MAP_CENTER: [39.0, -105.5],
    MAP_ZOOM: 7,
    MAP_TILE_PROVIDER: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=ac90b6e9-8eef-490e-8c0d-4005455f88a9',
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
    markerClusterGroup: null,
    markers: {},
    sortColumn: 'name',
    sortAscending: true,
    currentFilters: {
        search: '',
        city: '',
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
        
        // Initialize marker cluster group
        // Using standard Leaflet.MarkerCluster spiderfication (circle layout)
        state.markerClusterGroup = L.markerClusterGroup({
            // Only cluster markers that are very close together
            maxClusterRadius: 20,
            // Disable clustering at zoom level 13+
            disableClusteringAtZoom: 13,
            // Spiderfication options for the circle layout
            spiderLegPolylineOptions: {
                weight: 2,
                color: '#c41e3a',
                opacity: 0.5
            },
            // More distance between spiderfied markers = larger circle
            spiderfyDistanceMultiplier: 2,
            // Distance added to each circle radius
            spiderfyDistanceSurplus: 40,
            // Animation when spiderfying
            animate: true,
            // Show coverage when hovering clusters
            showCoverageOnHover: false,
            // Max zoom for clustering
            maxZoom: 18,
            // Use the default marker cluster icon
            iconCreateFunction: function(cluster) {
                const count = cluster.getChildCount();
                let size = 'large';
                let icon = '🎄';
                
                if (count < 10) {
                    size = 'small';
                } else if (count < 100) {
                    size = 'medium';
                }
                
                return L.divIcon({
                    html: `<div class="cluster-icon cluster-${size}"><span>${count}</span></div>`,
                    className: 'cluster',
                    iconSize: [40, 40]
                });
            }
        });
        state.map.addLayer(state.markerClusterGroup);
        
        console.log('✅ Map initialized with spiderfying clusters (circle layout)');
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
        
        const address = values[5]?.trim() || '';
        const city = extractCityFromAddress(address);
        
        const market = {
            name: values[0]?.trim() || '',
            lat: parseFloat(values[1]) || null,
            lon: parseFloat(values[2]) || null,
            region: values[3]?.trim() || 'Unknown',
            city: city,
            zipCode: values[4]?.trim() || '',
            address: address,
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

function extractCityFromAddress(address) {
    // Extract city from various address formats:
    // "Street Address, City, State Zip"
    // "Street Address, City, CO Zip"
    // "Place Name, Street Address, City, CO Zip"
    // "Street Address, Denver, CO 80211"
    
    if (!address || address.trim() === '') return 'Unknown';
    
    const parts = address.split(',').map(p => p.trim());
    
    // Look for the part that contains a state abbreviation (CO, etc.)
    // The city should be right before the state
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        // Check if this part contains a state abbreviation (2 uppercase letters, possibly followed by zip)
        if (/\b[A-Z]{2}\b\s*\d{5}/.test(part) || /^[A-Z]{2}$/.test(part)) {
            // Found the state, city should be the previous part
            if (i > 0) {
                const cityPart = parts[i - 1];
                // Validate it's not just a street address
                if (cityPart && !cityPart.match(/^\d+\s/) && cityPart.length > 0) {
                    return cityPart;
                }
            }
            break;
        }
    }
    
    // Fallback: if we have at least 2 parts, assume second-to-last is city
    if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        // If last part looks like state+zip (e.g., "CO 80211"), city is second-to-last
        if (/[A-Z]{2}\s*\d{5}/.test(lastPart) || /^[A-Z]{2}$/.test(lastPart)) {
            const cityPart = parts[parts.length - 2].trim();
            if (cityPart && !cityPart.match(/^\d+\s/) && cityPart.length > 0) {
                return cityPart;
            }
        }
    }
    
    return 'Unknown';
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
    // Parse date ranges in formats:
    // "Nov. 28-Dec. 1, Dec. 13-14, Dec. 20-21"
    // "Dec. 13-14"
    // "Nov. 20-Dec. 24"
    // Also handles pipe format for backwards compatibility: "Nov 29|Nov 30, Dec 5|Dec 7"
    
    const dates = [];
    const monthMap = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    
    try {
        // Split by commas to get individual ranges
        const ranges = dateString.split(',').map(r => r.trim());
        
        for (const range of ranges) {
            // Check if this is pipe format (newer) or dash format (display format)
            if (range.includes('|')) {
                // Pipe format: "Nov 29|Nov 30"
                const [startStr, endStr] = range.split('|').map(s => s.trim());
                
                if (startStr && endStr) {
                    const startDate = parseSimpleDate(startStr, monthMap);
                    const endDate = parseSimpleDate(endStr, monthMap);
                    
                    if (startDate && endDate) {
                        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                            dates.push(new Date(d));
                        }
                    }
                }
            } else if (range.includes('-')) {
                // Dash format: "Nov. 28-Dec. 1" or "Dec. 13-14"
                // Find the position of the dash that separates dates
                const dashPos = range.lastIndexOf('-');
                
                if (dashPos > 0) {
                    let startStr = range.substring(0, dashPos).trim();
                    let endStr = range.substring(dashPos + 1).trim();
                    
                    // Parse start date (should have month and day)
                    const startDate = parseDateWithMonth(startStr, monthMap);
                    
                    // Parse end date - might be just day if same month, or full date if different month
                    let endDate = null;
                    
                    // First, try to parse as full date (Month. Day)
                    endDate = parseDateWithMonth(endStr, monthMap);
                    
                    if (!endDate) {
                        // If that didn't work, try to parse as just a day number
                        const dayMatch = endStr.match(/(\d+)/);
                        if (dayMatch && startDate) {
                            const day = parseInt(dayMatch[1]);
                            // Use the same month as start date
                            endDate = new Date(2025, startDate.getMonth(), day);
                        }
                    }
                    
                    if (startDate && endDate) {
                        console.log(`Parsing range: "${range}" -> ${startDate.toDateString()} to ${endDate.toDateString()}`);
                        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                            dates.push(new Date(d));
                        }
                    } else {
                        console.warn(`Could not parse range: "${range}"`);
                    }
                }
            } else {
                // Single date: "Nov. 28" or "Dec. 13"
                const singleDate = parseDateWithMonth(range, monthMap);
                if (singleDate) {
                    dates.push(singleDate);
                }
            }
        }
    } catch (e) {
        console.warn('Could not parse dates:', dateString, e);
    }
    
    return dates;
}

function parseDateWithMonth(dateStr, monthMap) {
    // Parse format like "Nov. 28" or "Dec. 1" or "Dec 24"
    // Handle both with and without periods
    const match = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d+)/i);
    if (match) {
        const monthStr = match[1].toLowerCase().substring(0, 3);
        const month = monthMap[monthStr];
        const day = parseInt(match[2]);
        
        if (month !== undefined) {
            return new Date(2025, month, day);
        }
    }
    return null;
}

function getMonthFromString(dateStr, monthMap) {
    // Extract month number from a date string
    const match = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (match) {
        const monthStr = match[1].toLowerCase().substring(0, 3);
        return monthMap[monthStr];
    }
    return null;
}

function parseSimpleDate(dateStr, monthMap) {
    // Parse format like "Nov 29" or "Dec 5" (pipe format)
    const match = dateStr.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d+)/i);
    if (match) {
        const monthStr = match[1].toLowerCase().substring(0, 3);
        const month = monthMap[monthStr];
        const day = parseInt(match[2]);
        
        if (month !== undefined) {
            return new Date(2025, month, day);
        }
    }
    return null;
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
        
        const matchesCity = 
            !state.currentFilters.city || 
            market.city === state.currentFilters.city;
        
        let matchesDate = true;
        if (state.currentFilters.dateFilter) {
            matchesDate = marketIsOpenOnDate(market, state.currentFilters.dateFilter);
        }
        
        return matchesSearch && matchesCity && matchesDate;
    });
    
    // Sort the filtered results
    sortFilteredMarkets();
}

function sortFilteredMarkets() {
    state.filteredMarkets.sort((a, b) => {
        let aVal, bVal;
        
        switch(state.sortColumn) {
            case 'name':
                aVal = a.name.toLowerCase();
                bVal = b.name.toLowerCase();
                break;
            case 'date':
                aVal = a.date.toLowerCase();
                bVal = b.date.toLowerCase();
                break;
            case 'city':
                aVal = a.city.toLowerCase();
                bVal = b.city.toLowerCase();
                break;
            default:
                return 0;
        }
        
        if (aVal < bVal) return state.sortAscending ? -1 : 1;
        if (aVal > bVal) return state.sortAscending ? 1 : -1;
        return 0;
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
    console.log('🎯 Rendering markers for', state.filteredMarkets.length, 'markets');
    
    // Clear existing markers from cluster group
    state.markerClusterGroup.clearLayers();
    state.markers = {};
    
    // Add filtered markers to cluster group
    state.filteredMarkets.forEach(market => {
        const marker = L.marker(
            [market.lat, market.lon],
            {
                icon: createCustomIcon(market === state.selectedMarket),
                title: market.name
            }
        );
        
        marker.on('click', () => {
            console.log('🗺️  Map marker clicked:', market.name);
            selectMarket(market);
        });
        
        state.markerClusterGroup.addLayer(marker);
        state.markers[market.name] = { marker, market };
    });
    
    // Fit map bounds to filtered markers if any exist
    if (state.filteredMarkets.length > 0) {
        setTimeout(() => {
            try {
                const bounds = state.markerClusterGroup.getBounds();
                if (bounds.isValid()) {
                    state.map.fitBounds(bounds, { padding: [50, 50] });
                }
            } catch (e) {
                console.warn('Could not fit bounds:', e);
            }
        }, 100);
    }
    
    console.log('✅ Markers rendered, total:', Object.keys(state.markers).length);
}

function createCustomIcon(isActive = false) {
    const html = `<div class="market-marker ${isActive ? 'active' : ''}">❄️</div>`;
    return L.divIcon({
        html: html,
        className: '',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
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
            <td>${market.city}</td>
        `;
        row.addEventListener('click', () => selectMarket(market));
        tbody.appendChild(row);
    });
}

function updateResultsCount() {
    // Removed - we're no longer showing the count in the header
}

function populateRegionFilter() {
    const cities = [...new Set(state.markets.map(m => m.city))].sort();
    console.log('Cities found:', cities);
    const select = document.getElementById('cityFilter');
    
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
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
        <!-- Header row with date, cost, city -->
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
                <span class="details-quick-info-label">City</span>
                <span class="details-quick-info-value">${market.city}</span>
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
    
    // City filter
    document.getElementById('cityFilter').addEventListener('change', (e) => {
        state.currentFilters.city = e.target.value;
        updateDisplay();
    });
    
    // Table column sorting
    document.querySelectorAll('th.sortable').forEach(header => {
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-column');
            if (state.sortColumn === column) {
                state.sortAscending = !state.sortAscending;
            } else {
                state.sortColumn = column;
                state.sortAscending = true;
            }
            updateDisplay();
        });
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