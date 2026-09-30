/**
 * Callwise Agent Daily Tracker - Main Application
 * A comprehensive sales team performance dashboard
 */

// ============================================================================
// Configuration & Constants
// ============================================================================

const CONFIG = {
  // Data file paths (relative to index.html)
  dataFiles: {
    calls: 'data/call_details.csv',
    leads: 'data/lead_details.csv',
    dump: 'data/lead_list_dump.csv'
  },
  // Default agents (fallback if not in data)
  defaultAgents: [
    'Gagan S D', 'Pavya', 'Varshitha', 'Unassigned'
  ],
  // Date format
  dateFormat: 'YYYY-MM-DD',
  displayDateFormat: 'DD MMM YYYY',
  // Chart colors
  chartColors: {
    primary: '#2563EB',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#0891B2',
    muted: '#94A3B8',
    grid: '#E2E8F0',
    text: '#64748B'
  },
  // FTD sub-status categories
  ftdCategories: {
    'Qualified': ['Appointment Booked', 'Appointment Successful', 'Qualified Leads', 'Appointment Unsuccessful'],
    'In Progress': ['Call Back', 'Follow-up - Later', 'Site Not Ready', 'Fresh Lead', 'Unable to Contact', 'Low Budget'],
    'Dead': ['Not Interested', 'Dead Lead', 'Location Not Serviceable', 'Duplicate Lead', 'Not Offered Products', 'Exceeded Max Attempts']
  }
};

// ============================================================================
// State Management
// ============================================================================

const state = {
  // Raw data
  rawData: {
    calls: [],
    leads: [],
    dump: []
  },
  // Processed data
  data: {
    calls: [],
    leads: [],
    dump: [],
    agents: [],
    dates: []
  },
  // Current filters
  filters: {
    date: null,
    period: 'ftd', // 'ftd' or 'mtd'
    view: 'overview'
  },
  // Charts
  charts: {},
  // UI state
  ui: {
    loading: false,
    error: null,
    lastUpdated: null
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

const utils = {
  // Date formatting
  formatDate(dateStr, format = 'display') {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    if (format === 'display') {
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    return date.toISOString().split('T')[0];
  },

  parseDate(dateStr) {
    if (!dateStr) return null;
    // Handle various formats: DD-MM-YYYY, YYYY-MM-DD, etc.
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      // Assume DD-MM-YYYY or YYYY-MM-DD
      if (parts[0].length === 4) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateStr);
  },

  formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return Number(num).toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  },

  formatPercent(num, decimals = 1) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    return `${Number(num).toFixed(decimals)}%`;
  },

  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '—';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  },

  // Generate initials from name
  getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },

  // Color for agent avatar
  getAvatarColor(name) {
    const colors = [
      '#2563EB', '#059669', '#D97706', '#DC2626',
      '#7C3AED', '#DB2777', '#0891B2', '#EA580C'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  },

  // Debounce
  debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // Deep clone
  clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  // Generate unique ID
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};

// ============================================================================
// Data Loading & Processing
// ============================================================================

const dataLoader = {
  async loadAll() {
    state.ui.loading = true;
    ui.showLoading(true);

    try {
      // Load CSV files in parallel
      const [calls, leads, dump] = await Promise.all([
        this.loadCSV(CONFIG.dataFiles.calls),
        this.loadCSV(CONFIG.dataFiles.leads),
        this.loadCSV(CONFIG.dataFiles.dump)
      ]);

      state.rawData.calls = calls;
      state.rawData.leads = leads;
      state.rawData.dump = dump;

      // Process data
      this.processData();

      // Set default date to latest available
      if (state.data.dates.length > 0) {
        state.filters.date = state.data.dates[0];
        document.getElementById('date-picker').value = state.filters.date;
      }

      // Update UI
      this.updateDataSources();
      ui.renderCurrentView();
      ui.showLoading(false);

      state.ui.lastUpdated = new Date();
      ui.showToast('success', 'Data loaded', `Loaded ${calls.length} calls, ${leads.length} leads, ${dump.length} dump records`);
    } catch (error) {
      console.error('Data loading error:', error);
      state.ui.error = error.message;
      ui.showError(error.message);
      ui.showLoading(false);
    } finally {
      state.ui.loading = false;
    }
  },

  async loadCSV(url) {
    const response = await fetch(url);
    if (!response.ok) {
      // If file doesn't exist, return empty array (demo mode)
      console.warn(`CSV not found: ${url}, using demo data`);
      return this.getDemoData(url);
    }
    const text = await response.text();
    return this.parseCSV(text);
  },

  parseCSV(text) {
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim(),
        complete: (results) => resolve(results.data),
        error: reject
      });
    });
  },

  getDemoData(type) {
    // Return demo data based on file type
    if (type.includes('call')) return this.getDemoCalls();
    if (type.includes('lead_details')) return this.getDemoLeads();
    if (type.includes('dump')) return this.getDemoDump();
    return [];
  },

  getDemoCalls() {
    // Generate realistic demo call data for the last 30 days
    const agents = CONFIG.defaultAgents;
    const data = [];
    const statuses = ['Connected', 'Missed', 'Voicemail', 'Busy', 'No Answer'];
    const outcomes = ['Appointment Booked', 'Call Back', 'Follow-up', 'Not Interested', 'Wrong Number'];

    for (let day = 0; day < 30; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const dateStr = date.toISOString().split('T')[0];

      agents.forEach(agent => {
        const callsPerDay = Math.floor(Math.random() * 30) + 10;
        for (let i = 0; i < callsPerDay; i++) {
          const hour = Math.floor(Math.random() * 10) + 9; // 9AM - 6PM
          const minute = Math.floor(Math.random() * 60);
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          const connected = status === 'Connected';
          const duration = connected ? Math.floor(Math.random() * 300) + 30 : 0;
          const outcome = connected ? outcomes[Math.floor(Math.random() * outcomes.length)] : '';

          data.push({
            Date: dateStr,
            Agent: agent,
            Time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            Duration: duration,
            Status: status,
            Outcome: outcome,
            DID: `+91-80-${Math.floor(Math.random() * 9000000) + 1000000}`,
            Caller: `+91-${Math.floor(Math.random() * 9000000000) + 1000000000}`
          });
        }
      });
    }
    return data;
  },

  getDemoLeads() {
    const agents = CONFIG.defaultAgents;
    const statuses = ['Fresh Lead', 'Call Back', 'Follow-up - Later', 'Appointment Booked', 'Appointment Successful',
      'Qualified Leads', 'Unable to Contact', 'Not Interested', 'Dead Lead', 'Low Budget',
      'Site Not Ready', 'Duplicate Lead', 'Location Not Serviceable', 'Not Offered Products'];
    const sources = ['Meta Ads', 'Google Ads', 'Website', 'Referral', 'Walk-in', 'Cold Call', 'Email Campaign'];
    const data = [];

    for (let day = 0; day < 30; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const dateStr = date.toISOString().split('T')[0];

      agents.forEach(agent => {
        const leadsPerDay = Math.floor(Math.random() * 8) + 2;
        for (let i = 0; i < leadsPerDay; i++) {
          data.push({
            Date: dateStr,
            Agent: agent,
            'Lead Name': `Lead ${utils.uid().slice(0, 6)}`,
            Phone: `+91-${Math.floor(Math.random() * 9000000000) + 1000000000}`,
            Source: sources[Math.floor(Math.random() * sources.length)],
            Status: statuses[Math.floor(Math.random() * statuses.length)],
            'Follow-up Date': dateStr
          });
        }
      });
    }
    return data;
  },

  getDemoDump() {
    // Larger dataset for lead list dump
    return this.getDemoLeads().concat(this.getDemoLeads()).concat(this.getDemoLeads());
  },

  processData() {
    const { calls, leads, dump } = state.rawData;

    // Normalize dates
    const normalizeDate = (record, field = 'Date') => {
      const date = utils.parseDate(record[field]);
      return date ? date.toISOString().split('T')[0] : null;
    };

    // Process calls
    state.data.calls = calls.map(c => ({
      ...c,
      date: normalizeDate(c),
      duration: Number(c.Duration || c['Total Talk Time (Sec)'] || 0),
      connected: (c.Status || '').toLowerCase() === 'connected',
      agent: c.Agent || c['Lead Owner'] || 'Unassigned'
    })).filter(c => c.date);

    // Process leads
    state.data.leads = leads.map(l => ({
      ...l,
      date: normalizeDate(l),
      agent: l.Agent || l['Lead Owner'] || 'Unassigned',
      status: l.Status || l['Lead Status'] || 'Fresh Lead',
      source: l.Source || l['Lead Source'] || 'Unknown'
    })).filter(l => l.date);

    // Process dump
    state.data.dump = dump.map(d => ({
      ...d,
      date: normalizeDate(d),
      agent: d.Agent || d['Lead Owner'] || 'Unassigned',
      status: d.Status || d['Lead Status'] || 'Fresh Lead',
      source: d.Source || d['Lead Source'] || 'Unknown'
    })).filter(d => d.date);

    // Extract unique dates (sorted desc)
    const allDates = new Set();
    [...state.data.calls, ...state.data.leads, ...state.data.dump].forEach(r => {
      if (r.date) allDates.add(r.date);
    });
    state.data.dates = Array.from(allDates).sort().reverse();

    // Extract unique agents
    const allAgents = new Set();
    [...state.data.calls, ...state.data.leads, ...state.data.dump].forEach(r => {
      if (r.agent) allAgents.add(r.agent);
    });
    state.data.agents = Array.from(allAgents).sort();
  },

  // Get filtered data for current date
  getFilteredData() {
    const { date } = state.filters;
    if (!date) return { calls: [], leads: [], dump: [] };

    return {
      calls: state.data.calls.filter(c => c.date === date),
      leads: state.data.leads.filter(l => l.date === date),
      dump: state.data.dump.filter(d => d.date === date)
    };
  },

  // Get MTD data (month to date)
  getMTDData() {
    const { date } = state.filters;
    if (!date) return { calls: [], leads: [], dump: [] };

    const targetMonth = date.slice(0, 7); // YYYY-MM
    return {
      calls: state.data.calls.filter(c => c.date.startsWith(targetMonth)),
      leads: state.data.leads.filter(l => l.date.startsWith(targetMonth)),
      dump: state.data.dump.filter(d => d.date.startsWith(targetMonth))
    };
  },

  updateDataSources() {
    const { date } = state.filters;
    const filtered = this.getFilteredData();

    document.getElementById('source-calls').textContent = utils.formatNumber(filtered.calls.length);
    document.getElementById('source-leads').textContent = utils.formatNumber(filtered.leads.length);
    document.getElementById('source-dump').textContent = utils.formatNumber(filtered.dump.length);

    // Update date displays
    const displayDate = utils.formatDate(date);
    ['overview-date', 'agents-date', 'leads-date', 'calls-date', 'dids-date', 'ftd-date', 'attendance-date']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = displayDate;
      });
  }
};

// ============================================================================
// Analytics & Computations
// ============================================================================

const analytics = {
  // Overview KPIs
  computeOverviewKPIs(data) {
    const { calls, leads } = data;
    const totalCalls = calls.length;
    const connectedCalls = calls.filter(c => c.connected).length;
    const connectRate = totalCalls > 0 ? (connectedCalls / totalCalls * 100) : 0;
    const totalLeads = leads.length;
    const appointments = calls.filter(c => c.Outcome?.includes('Appointment')).length;
    const apptRate = connectedCalls > 0 ? (appointments / connectedCalls * 100) : 0;
    const avgTalkTime = connectedCalls > 0
      ? calls.filter(c => c.connected).reduce((sum, c) => sum + c.duration, 0) / connectedCalls
      : 0;

    return {
      totalCalls: { value: totalCalls, label: 'Total Calls', icon: 'calls', trend: null },
      connectedCalls: { value: connectedCalls, label: 'Connected', icon: 'connected', trend: { value: connectRate, positive: connectRate > 30 } },
      connectRate: { value: connectRate, label: 'Connect Rate', icon: 'rate', trend: null },
      appointments: { value: appointments, label: 'Appointments', icon: 'appointments', trend: { value: apptRate, positive: apptRate > 15 } },
      totalLeads: { value: totalLeads, label: 'Total Leads', icon: 'leads', trend: null },
      avgTalkTime: { value: avgTalkTime, label: 'Avg Talk Time', icon: 'duration', trend: null }
    };
  },

  // Agent Performance
  computeAgentPerformance(data, period = 'ftd') {
    const { calls, leads } = data;
    const agents = [...new Set([...calls.map(c => c.agent), ...leads.map(l => l.agent)])];

    return agents.map(agent => {
      const agentCalls = calls.filter(c => c.agent === agent);
      const agentLeads = leads.filter(l => l.agent === agent);
      const connected = agentCalls.filter(c => c.connected);
      const appointments = agentCalls.filter(c => c.Outcome?.includes('Appointment'));
      const totalTalkTime = connected.reduce((sum, c) => sum + c.duration, 0);

      return {
        name: agent,
        dialed: agentCalls.length,
        connected: connected.length,
        connectRate: agentCalls.length > 0 ? (connected.length / agentCalls.length * 100) : 0,
        appointments: appointments.length,
        apptRate: connected.length > 0 ? (appointments.length / connected.length * 100) : 0,
        leads: agentLeads.length,
        avgTalkTime: connected.length > 0 ? totalTalkTime / connected.length : 0,
        totalTalkTime
      };
    }).sort((a, b) => b.connected - a.connected);
  },

  // Hourly Call Breakdown
  computeHourlyCalls(data) {
    const { calls } = data;
    const hourly = {};

    for (let h = 0; h < 24; h++) {
      hourly[h] = { total: 0, connected: 0, duration: 0, appointments: 0 };
    }

    calls.forEach(c => {
      const hour = parseInt(c.Time?.split(':')[0]) || 0;
      if (hour >= 0 && hour < 24) {
        hourly[hour].total++;
        if (c.connected) {
          hourly[hour].connected++;
          hourly[hour].duration += c.duration;
          if (c.Outcome?.includes('Appointment')) hourly[hour].appointments++;
        }
      }
    });

    return Object.entries(hourly).map(([hour, stats]) => ({
      hour: parseInt(hour),
      label: `${hour.padStart(2, '0')}:00`,
      ...stats,
      connectRate: stats.total > 0 ? (stats.connected / stats.total * 100) : 0,
      avgDuration: stats.connected > 0 ? stats.duration / stats.connected : 0
    }));
  },

  // Lead Status Distribution
  computeLeadStatus(data) {
    const { leads, dump } = data;
    const allLeads = [...leads, ...dump];
    const statusCounts = {};

    allLeads.forEach(l => {
      const status = l.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  },

  // Lead Source Analysis
  computeLeadSources(data) {
    const { leads, dump } = data;
    const allLeads = [...leads, ...dump];
    const sourceMap = {};

    allLeads.forEach(l => {
      const source = l.source || 'Unknown';
      if (!sourceMap[source]) {
        sourceMap[source] = { total: 0, statuses: {} };
      }
      sourceMap[source].total++;
      const status = l.status || 'Unknown';
      sourceMap[source].statuses[status] = (sourceMap[source].statuses[status] || 0) + 1;
    });

    return Object.entries(sourceMap)
      .map(([source, data]) => ({
        source,
        total: data.total,
        fresh: data.statuses['Fresh Lead'] || 0,
        qualified: (data.statuses['Qualified Leads'] || 0) + (data.statuses['Appointment Booked'] || 0),
        appointments: data.statuses['Appointment Successful'] || 0,
        closedWon: data.statuses['Closed Won'] || 0,
        dead: (data.statuses['Dead Lead'] || 0) + (data.statuses['Not Interested'] || 0)
      }))
      .sort((a, b) => b.total - a.total);
  },

  // Agent Lead Ownership
  computeAgentLeads(data) {
    const { leads, dump } = data;
    const allLeads = [...leads, ...dump];
    const agentMap = {};

    allLeads.forEach(l => {
      const agent = l.agent || 'Unassigned';
      if (!agentMap[agent]) {
        agentMap[agent] = { total: 0, statuses: {} };
      }
      agentMap[agent].total++;
      const status = l.status || 'Unknown';
      agentMap[agent].statuses[status] = (agentMap[agent].statuses[status] || 0) + 1;
    });

    return Object.entries(agentMap)
      .map(([agent, data]) => {
        const inProgress = (data.statuses['Call Back'] || 0) + (data.statuses['Follow-up - Later'] || 0) + (data.statuses['Site Not Ready'] || 0);
        const qualified = (data.statuses['Qualified Leads'] || 0) + (data.statuses['Appointment Booked'] || 0);
        const appointments = data.statuses['Appointment Successful'] || 0;
        const conversion = data.total > 0 ? (appointments / data.total * 100) : 0;

        return {
          agent,
          total: data.total,
          fresh: data.statuses['Fresh Lead'] || 0,
          inProgress,
          qualified,
          appointments,
          conversion
        };
      })
      .sort((a, b) => b.total - a.total);
  },

  // Agent Call Summary
  computeAgentCalls(data) {
    const { calls } = data;
    const agentMap = {};

    calls.forEach(c => {
      const agent = c.agent || 'Unassigned';
      if (!agentMap[agent]) {
        agentMap[agent] = { total: 0, connected: 0, failed: 0, duration: 0, appointments: 0 };
      }
      agentMap[agent].total++;
      if (c.connected) {
        agentMap[agent].connected++;
        agentMap[agent].duration += c.duration;
        if (c.Outcome?.includes('Appointment')) agentMap[agent].appointments++;
      } else {
        agentMap[agent].failed++;
      }
    });

    return Object.entries(agentMap)
      .map(([agent, stats]) => ({
        agent,
        ...stats,
        connectRate: stats.total > 0 ? (stats.connected / stats.total * 100) : 0,
        avgTalkTime: stats.connected > 0 ? stats.duration / stats.connected : 0
      }))
      .sort((a, b) => b.total - a.total);
  },

  // DID Analysis
  computeDIDs(data) {
    const { calls } = data;
    const didMap = {};

    calls.forEach(c => {
      const did = c.DID || 'Unknown';
      if (!didMap[did]) {
        didMap[did] = { total: 0, answered: 0, missed: 0, waitTimes: [], agent: c.agent };
      }
      didMap[did].total++;
      if (c.connected) {
        didMap[did].answered++;
      } else {
        didMap[did].missed++;
        // Simulate wait time for missed calls
        didMap[did].waitTimes.push(Math.floor(Math.random() * 60) + 10);
      }
    });

    return Object.entries(didMap)
      .map(([did, stats]) => ({
        did,
        total: stats.total,
        answered: stats.answered,
        missed: stats.missed,
        answerRate: stats.total > 0 ? (stats.answered / stats.total * 100) : 0,
        avgWaitTime: stats.waitTimes.length > 0
          ? stats.waitTimes.reduce((a, b) => a + b, 0) / stats.waitTimes.length
          : 0,
        agent: stats.agent
      }))
      .sort((a, b) => b.total - a.total);
  },

  // Missed Calls Detail
  computeMissedCalls(data) {
    const { calls } = data;
    return calls
      .filter(c => !c.connected)
      .map(c => ({
        time: c.Time,
        did: c.DID,
        caller: c.Caller,
        duration: c.duration,
        action: c.Status
      }))
      .slice(0, 50); // Limit to 50 most recent
  },

  // FTD Sub-status
  computeFTD(data) {
    const { leads } = data;
    const statusCounts = {};

    leads.forEach(l => {
      const status = l.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const total = leads.length;
    const allStatuses = [
      'Appointment Booked', 'Appointment Successful', 'Appointment Unsuccessful',
      'Call Back', 'Follow-up - Later', 'Site Not Ready', 'Fresh Lead',
      'Unable to Contact', 'Low Budget', 'Not Interested', 'Dead Lead',
      'Duplicate Lead', 'Location Not Serviceable', 'Not Offered Products',
      'Exceeded Max Attempts', 'Qualified Leads'
    ];

    return allStatuses
      .filter(s => statusCounts[s] > 0)
      .map(status => ({
        status,
        count: statusCounts[status],
        percent: total > 0 ? (statusCounts[status] / total * 100) : 0,
        category: this.getFTDCategory(status)
      }))
      .sort((a, b) => b.count - a.count);
  },

  getFTDCategory(status) {
    for (const [category, statuses] of Object.entries(CONFIG.ftdCategories)) {
      if (statuses.includes(status)) return category;
    }
    return 'Other';
  },

  computeFTDCategories(data) {
    const ftd = this.computeFTD(data);
    const categories = {};

    ftd.forEach(item => {
      if (!categories[item.category]) {
        categories[item.category] = { count: 0, items: [] };
      }
      categories[item.category].count += item.count;
      categories[item.category].items.push({ name: item.status, count: item.count });
    });

    return Object.entries(categories)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  },

  // Attendance
  computeAttendance(data) {
    const { calls, leads } = data;
    const agents = [...new Set([...calls.map(c => c.agent), ...leads.map(l => l.agent)])];

    // Generate demo attendance based on activity
    return agents.map(agent => {
      const hasActivity = calls.some(c => c.agent === agent) || leads.some(l => l.agent === agent);
      const status = hasActivity ? (Math.random() > 0.1 ? 'Present' : 'Late') : 'Absent';
      const checkIn = hasActivity ? '09:00' : '—';
      const checkOut = hasActivity ? '18:00' : '—';
      const hours = hasActivity ? '9.0' : '0';
      const breakTime = hasActivity ? '1.0' : '0';
      const notes = hasActivity ? '' : 'No activity logged';

      return { agent, status, checkIn, checkOut, hours, breakTime, notes };
    });
  },

  computeMonthlyAttendance() {
    // Generate demo monthly attendance
    return state.data.agents.map(agent => ({
      agent,
      present: Math.floor(Math.random() * 5) + 20,
      absent: Math.floor(Math.random() * 3),
      late: Math.floor(Math.random() * 2),
      halfDay: Math.floor(Math.random() * 2)
    })).map(a => ({
      ...a,
      attendancePct: ((a.present + a.halfDay * 0.5) / (a.present + a.absent + a.late + a.halfDay) * 100).toFixed(1)
    }));
  }
};

// ============================================================================
// Chart Rendering
// ============================================================================

const charts = {
  init() {
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.color = '#64748B';
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 16;
  },

  renderHourlyCalls(data) {
    const ctx = document.getElementById('hourly-calls-chart');
    if (!ctx) return;

    const hourly = analytics.computeHourlyCalls(data);
    const hasData = hourly.some(h => h.total > 0);

    document.getElementById('hourly-calls-empty').classList.toggle('hidden', hasData);
    ctx.style.display = hasData ? 'block' : 'none';

    if (!hasData) return;

    if (this.charts.hourlyCalls) {
      this.charts.hourlyCalls.destroy();
    }

    this.charts.hourlyCalls = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hourly.map(h => h.label),
        datasets: [
          {
            label: 'Total Calls',
            data: hourly.map(h => h.total),
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderColor: '#2563EB',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Connected',
            data: hourly.map(h => h.connected),
            backgroundColor: 'rgba(5, 150, 105, 0.7)',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: this.getChartOptions('Hourly Call Volume')
    });
  },

  renderLeadStatus(data) {
    const ctx = document.getElementById('lead-status-chart');
    if (!ctx) return;

    const statuses = analytics.computeLeadStatus(data);
    const hasData = statuses.length > 0;

    document.getElementById('lead-status-empty').classList.toggle('hidden', hasData);
    ctx.style.display = hasData ? 'block' : 'none';

    if (!hasData) return;

    const colors = [
      '#2563EB', '#059669', '#D97706', '#DC2626',
      '#7C3AED', '#DB2777', '#0891B2', '#EA580C',
      '#65A30D', '#9333EA', '#E11D48', '#0D9488'
    ];

    if (this.charts.leadStatus) {
      this.charts.leadStatus.destroy();
    }

    this.charts.leadStatus = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: statuses.map(s => s.status),
        datasets: [{
          data: statuses.map(s => s.count),
          backgroundColor: colors.slice(0, statuses.length),
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        ...this.getChartOptions('Lead Status Distribution'),
        cutout: '60%',
        plugins: {
          ...this.getChartOptions().plugins,
          legend: {
            position: 'right',
            labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
          }
        }
      }
    });
  },

  getChartOptions(title = '') {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!title,
          text: title,
          font: { size: 14, weight: '600' },
          color: '#1E293B',
          padding: { bottom: 16 }
        },
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: '#1E293B',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 11 },
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: '#E2E8F0' },
          ticks: { font: { size: 10 }, stepSize: 1 }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    };
  },

  destroyAll() {
    Object.values(this.charts).forEach(chart => chart?.destroy());
    this.charts = {};
  }
};

// ============================================================================
// UI Rendering
// ============================================================================

const ui = {
  elements: {},

  init() {
    // Cache DOM elements
    this.elements = {
      loadingOverlay: document.getElementById('loading-overlay'),
      errorBoundary: document.getElementById('error-boundary'),
      errorMessage: document.getElementById('error-message'),
      errorRetry: document.getElementById('error-retry'),
      mainLayout: document.getElementById('main-layout'),
      sidebar: document.getElementById('sidebar'),
      mainContent: document.getElementById('main-content'),
      datePicker: document.getElementById('date-picker'),
      refreshBtn: document.getElementById('refresh-btn'),
      exportBtn: document.getElementById('export-btn'),
      navButtons: document.querySelectorAll('.nav-btn'),
      tabButtons: document.querySelectorAll('.tab-btn'),
      views: document.querySelectorAll('.view'),
      toastContainer: document.getElementById('toast-container'),
      ftdSearch: document.getElementById('ftd-search')
    };

    this.bindEvents();
    charts.init();
  },

  bindEvents() {
    // Navigation
    this.elements.navButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // Tab switching
    this.elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.period));
    });

    // Date picker
    this.elements.datePicker.addEventListener('change', (e) => {
      state.filters.date = e.target.value;
      dataLoader.updateDataSources();
      this.renderCurrentView();
    });

    // Refresh
    this.elements.refreshBtn.addEventListener('click', () => {
      dataLoader.loadAll();
    });

    // Export
    this.elements.exportBtn.addEventListener('click', () => this.exportData());

    // Error retry
    this.elements.errorRetry.addEventListener('click', () => {
      this.hideError();
      dataLoader.loadAll();
    });

    // FTD Search
    this.elements.ftdSearch.addEventListener('input', utils.debounce((e) => {
      this.filterFTDTable(e.target.value);
    }, 300));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        dataLoader.loadAll();
      }
      if (e.key === 'Escape') {
        this.hideError();
      }
    });
  },

  switchView(viewName) {
    // Update nav buttons
    this.elements.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
      btn.setAttribute('aria-current', btn.dataset.view === viewName ? 'page' : 'false');
    });

    // Update views
    this.elements.views.forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    // Update breadcrumb
    const viewTitles = {
      overview: 'Overview',
      agents: 'Agent Performance',
      leads: 'Lead Bifurcation',
      calls: 'Call Activity',
      dids: 'Inbound DIDs',
      ftd: 'FTD Sub-status',
      attendance: 'Attendance'
    };
    document.getElementById('crumb-current').textContent = viewTitles[viewName] || viewName;

    state.filters.view = viewName;
    this.renderCurrentView();
  },

  switchTab(period) {
    state.filters.period = period;
    this.elements.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.period === period);
      btn.setAttribute('aria-selected', btn.dataset.period === period);
    });
    this.renderView('agents');
  },

  renderCurrentView() {
    this.renderView(state.filters.view);
  },

  renderView(viewName) {
    const data = state.filters.period === 'mtd' ? dataLoader.getMTDData() : dataLoader.getFilteredData();

    switch (viewName) {
      case 'overview':
        this.renderOverview(data);
        break;
      case 'agents':
        this.renderAgents(data);
        break;
      case 'leads':
        this.renderLeads(data);
        break;
      case 'calls':
        this.renderCalls(data);
        break;
      case 'dids':
        this.renderDIDs(data);
        break;
      case 'ftd':
        this.renderFTD(data);
        break;
      case 'attendance':
        this.renderAttendance(data);
        break;
    }
  },

  // ========================================================================
  // View Renderers
  // ========================================================================

  renderOverview(data) {
    // KPIs
    const kpis = analytics.computeOverviewKPIs(data);
    const kpiGrid = document.getElementById('kpi-grid');
    kpiGrid.innerHTML = Object.entries(kpis).map(([key, kpi]) => `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">${kpi.label}</span>
          <div class="kpi-icon ${key === 'totalCalls' ? 'primary' : key === 'connectedCalls' ? 'success' : key === 'connectRate' ? 'info' : key === 'appointments' ? 'warning' : key === 'totalLeads' ? 'primary' : 'danger'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${this.getKPIcon(key)}
            </svg>
          </div>
        </div>
        <div class="kpi-value font-mono">${key === 'connectRate' ? utils.formatPercent(kpi.value) : key === 'avgTalkTime' ? utils.formatDuration(kpi.value) : utils.formatNumber(kpi.value)}</div>
        ${kpi.trend ? `
          <div class="kpi-trend ${kpi.trend.positive ? 'positive' : kpi.trend.value > 0 ? 'negative' : 'neutral'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${kpi.trend.positive ? '<polyline points="18 15 12 9 6 15">' : '<polyline points="6 9 12 15 18 9">'}
            </svg>
            <span>${utils.formatPercent(kpi.trend.value)}</span>
          </div>
        ` : ''}
      </div>
    `).join('');

    // Charts
    charts.renderHourlyCalls(data);
    charts.renderLeadStatus(data);

    // Quick Stats
    this.renderQuickStats(data);
  },

  getKPIcon(key) {
    const icons = {
      totalCalls: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.94 12.94 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.94 12.94 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
      connected: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.94 12.94 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.94 12.94 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
      rate: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
      appointments: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
      leads: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      duration: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>'
    };
    return icons[key] || '';
  },

  renderQuickStats(data) {
    const { calls, leads } = data;
    const container = document.getElementById('quick-stats');

    const stats = [
      { label: 'Unique Callers', value: new Set(calls.map(c => c.Caller).filter(Boolean)).size, icon: 'users', color: '#2563EB' },
      { label: 'Unique DIDs', value: new Set(calls.map(c => c.DID).filter(Boolean)).size, icon: 'phone', color: '#059669' },
      { label: 'Lead Sources', value: new Set(leads.map(l => l.source).filter(Boolean)).size, icon: 'source', color: '#D97706' },
      { label: 'Avg Calls/Agent', value: calls.length / Math.max(1, new Set(calls.map(c => c.agent)).size), icon: 'avg', color: '#7C3AED', decimal: 1 }
    ];

    container.innerHTML = stats.map(s => `
      <div class="quick-stat">
        <div class="quick-stat-icon" style="background: ${s.color};">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            ${this.getQuickStatIcon(s.icon)}
          </svg>
        </div>
        <div class="quick-stat-content">
          <div class="quick-stat-label">${s.label}</div>
          <div class="quick-stat-value font-mono">${s.decimal ? s.value.toFixed(s.decimal) : utils.formatNumber(s.value)}</div>
        </div>
      </div>
    `).join('');
  },

  getQuickStatIcon(type) {
    const icons = {
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.94 12.94 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.94 12.94 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
      source: '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
      avg: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>'
    };
    return icons[type] || '';
  },

  renderAgents(data) {
    const agents = analytics.computeAgentPerformance(data, state.filters.period);
    const tbody = document.getElementById('agents-tbody');
    const emptyState = document.getElementById('agents-empty');

    if (agents.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = agents.map(a => `
      <tr>
        <td><strong>${a.name}</strong></td>
        <td class="font-mono">${utils.formatNumber(a.dialed)}</td>
        <td class="font-mono font-medium">${utils.formatNumber(a.connected)}</td>
        <td class="font-mono">${utils.formatPercent(a.connectRate)}</td>
        <td class="font-mono font-medium">${utils.formatNumber(a.appointments)}</td>
        <td class="font-mono">${utils.formatPercent(a.apptRate)}</td>
        <td class="font-mono">${utils.formatNumber(a.leads)}</td>
        <td class="font-mono text-right">${utils.formatDuration(a.avgTalkTime)}</td>
      </tr>
    `).join('');

    // Agent cards
    const cardsContainer = document.getElementById('agent-cards');
    cardsContainer.innerHTML = agents.map(a => `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-avatar" style="background: ${utils.getAvatarColor(a.name)}22; color: ${utils.getAvatarColor(a.name)};">
            ${utils.getInitials(a.name)}
          </div>
          <div class="agent-info">
            <div class="agent-name">${a.name}</div>
            <div class="agent-role">Sales Agent</div>
          </div>
        </div>
        <div class="agent-metrics">
          <div class="agent-metric">
            <div class="agent-metric-label">Connected</div>
            <div class="agent-metric-value font-mono">${utils.formatNumber(a.connected)} / ${utils.formatNumber(a.dialed)}</div>
          </div>
          <div class="agent-metric">
            <div class="agent-metric-label">Connect Rate</div>
            <div class="agent-metric-value font-mono">${utils.formatPercent(a.connectRate)}</div>
          </div>
          <div class="agent-metric">
            <div class="agent-metric-label">Appointments</div>
            <div class="agent-metric-value font-mono">${utils.formatNumber(a.appointments)}</div>
          </div>
          <div class="agent-metric">
            <div class="agent-metric-label">Avg Talk</div>
            <div class="agent-metric-value font-mono">${utils.formatDuration(a.avgTalkTime)}</div>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderLeads(data) {
    // Lead Status Grid
    const statuses = analytics.computeLeadStatus(data);
    const totalLeads = statuses.reduce((sum, s) => sum + s.count, 0);
    const statusGrid = document.getElementById('lead-status-grid');

    statusGrid.innerHTML = statuses.map(s => {
      const pct = totalLeads > 0 ? (s.count / totalLeads * 100) : 0;
      const category = analytics.getFTDCategory(s.status);
      let iconColor = '#64748B';
      if (category === 'Qualified') iconColor = '#059669';
      else if (category === 'In Progress') iconColor = '#D97706';
      else if (category === 'Dead') iconColor = '#DC2626';

      return `
        <div class="lead-status-card">
          <div class="status-icon" style="background: ${iconColor}22; color: ${iconColor};">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${this.getStatusIcon(s.status)}
            </svg>
          </div>
          <div class="lead-status-label">${s.status}</div>
          <div class="lead-status-count font-mono">${utils.formatNumber(s.count)}</div>
          <div class="lead-status-percent">${utils.formatPercent(pct)} of total</div>
        </div>
      `;
    }).join('');

    // Lead Source Table
    const sources = analytics.computeLeadSources(data);
    const sourceTbody = document.getElementById('lead-source-tbody');
    const sourceEmpty = document.getElementById('lead-source-empty');

    if (sources.length === 0) {
      sourceTbody.innerHTML = '';
      sourceEmpty.classList.remove('hidden');
    } else {
      sourceEmpty.classList.add('hidden');
      sourceTbody.innerHTML = sources.map(s => `
        <tr>
          <td><strong>${s.source}</strong></td>
          <td class="font-mono">${utils.formatNumber(s.total)}</td>
          <td class="font-mono">${utils.formatNumber(s.fresh)}</td>
          <td class="font-mono">${utils.formatNumber(s.qualified)}</td>
          <td class="font-mono font-medium">${utils.formatNumber(s.appointments)}</td>
          <td class="font-mono text-success">${utils.formatNumber(s.closedWon)}</td>
          <td class="font-mono text-danger">${utils.formatNumber(s.dead)}</td>
        </tr>
      `).join('');
    }

    // Agent Lead Ownership
    const agentLeads = analytics.computeAgentLeads(data);
    const ownerTbody = document.getElementById('lead-owner-tbody');
    ownerTbody.innerHTML = agentLeads.map(a => `
      <tr>
        <td><strong>${a.agent}</strong></td>
        <td class="font-mono">${utils.formatNumber(a.total)}</td>
        <td class="font-mono">${utils.formatNumber(a.fresh)}</td>
        <td class="font-mono">${utils.formatNumber(a.inProgress)}</td>
        <td class="font-mono">${utils.formatNumber(a.qualified)}</td>
        <td class="font-mono font-medium">${utils.formatNumber(a.appointments)}</td>
        <td class="font-mono font-semibold ${a.conversion > 20 ? 'text-success' : ''}">${utils.formatPercent(a.conversion)}</td>
      </tr>
    `).join('');
  },

  getStatusIcon(status) {
    const icons = {
      'Appointment Booked': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
      'Appointment Successful': '<circle cx="12" cy="12" r="10"></circle><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      'Qualified Leads': '<path d="M9 12l2 2 4-4"></path><circle cx="12" cy="12" r="10"></circle>',
      'Call Back': '<path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
      'Follow-up - Later': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
      'Fresh Lead': '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
      'Unable to Contact': '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="9" x2="12" y2="12"></line><line x1="12" y1="15" x2="12.01" y2="15"></line>',
      'Not Interested': '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      'Dead Lead': '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      'Low Budget': '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
      'Site Not Ready': '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line>',
      'Duplicate Lead': '<rect x="2" y="4" width="20" height="14" rx="2"></rect><path d="M10 4v10"></path>',
      'Location Not Serviceable': '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      'Not Offered Products': '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      'Exceeded Max Attempts': '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
    };
    return icons[status] || '<circle cx="12" cy="12" r="10"></circle>';
  },

  renderCalls(data) {
    // Hourly calls table
    const hourly = analytics.computeHourlyCalls(data);
    const hourlyTbody = document.getElementById('hourly-calls-tbody');
    const hourlyEmpty = document.getElementById('hourly-calls-table-empty');

    const hasHourlyData = hourly.some(h => h.total > 0);
    hourlyEmpty.classList.toggle('hidden', hasHourlyData);

    hourlyTbody.innerHTML = hourly.map(h => `
      <tr>
        <td><strong>${h.label}</strong></td>
        <td class="font-mono">${utils.formatNumber(h.total)}</td>
        <td class="font-mono font-medium text-success">${utils.formatNumber(h.connected)}</td>
        <td class="font-mono">${utils.formatPercent(h.connectRate)}</td>
        <td class="font-mono text-right">${utils.formatDuration(h.avgDuration)}</td>
        <td class="font-mono font-medium">${utils.formatNumber(h.appointments)}</td>
      </tr>
    `).join('');

    // Agent calls table
    const agentCalls = analytics.computeAgentCalls(data);
    const agentCallsTbody = document.getElementById('agent-calls-tbody');
    agentCallsTbody.innerHTML = agentCalls.map(a => `
      <tr>
        <td><strong>${a.agent}</strong></td>
        <td class="font-mono">${utils.formatNumber(a.total)}</td>
        <td class="font-mono font-medium text-success">${utils.formatNumber(a.connected)}</td>
        <td class="font-mono text-danger">${utils.formatNumber(a.failed)}</td>
        <td class="font-mono">${utils.formatPercent(a.connectRate)}</td>
        <td class="font-mono text-right">${utils.formatDuration(a.totalTalkTime)}</td>
        <td class="font-mono text-right">${utils.formatDuration(a.avgTalkTime)}</td>
        <td class="font-mono font-medium">${utils.formatNumber(a.appointments)}</td>
      </tr>
    `).join('');
  },

  renderDIDs(data) {
    const dids = analytics.computeDIDs(data);
    const didsTbody = document.getElementById('dids-tbody');
    const didsEmpty = document.getElementById('dids-empty');

    if (dids.length === 0) {
      didsTbody.innerHTML = '';
      didsEmpty.classList.remove('hidden');
    } else {
      didsEmpty.classList.add('hidden');
      didsTbody.innerHTML = dids.map(d => `
        <tr>
          <td class="font-mono font-medium">${d.did}</td>
          <td class="font-mono">${utils.formatNumber(d.total)}</td>
          <td class="font-mono font-medium text-success">${utils.formatNumber(d.answered)}</td>
          <td class="font-mono text-danger">${utils.formatNumber(d.missed)}</td>
          <td class="font-mono">${utils.formatPercent(d.answerRate)}</td>
          <td class="font-mono text-right">${utils.formatDuration(d.avgWaitTime)}</td>
          <td>${d.agent || '—'}</td>
        </tr>
      `).join('');
    }

    // Missed calls
    const missed = analytics.computeMissedCalls(data);
    const missedTbody = document.getElementById('missed-calls-tbody');
    missedTbody.innerHTML = missed.map(m => `
      <tr>
        <td class="font-mono">${m.time}</td>
        <td class="font-mono">${m.did}</td>
        <td class="font-mono">${m.caller}</td>
        <td class="font-mono">${utils.formatDuration(m.duration)}</td>
        <td><span class="badge badge-neutral">${m.action}</span></td>
      </tr>
    `).join('');
  },

  renderFTD(data) {
    const ftd = analytics.computeFTD(data);
    const categories = analytics.computeFTDCategories(data);
    const tbody = document.getElementById('ftd-tbody');
    const emptyState = document.getElementById('ftd-empty');
    const categoryGrid = document.getElementById('ftd-category-grid');

    if (ftd.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      categoryGrid.innerHTML = '';
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = ftd.map(item => {
      let badgeClass = 'badge-neutral';
      if (item.category === 'Qualified') badgeClass = 'badge-success';
      else if (item.category === 'In Progress') badgeClass = 'badge-warning';
      else if (item.category === 'Dead') badgeClass = 'badge-danger';

      return `
        <tr>
          <td><strong>${item.status}</strong></td>
          <td class="font-mono">${utils.formatNumber(item.count)}</td>
          <td class="font-mono">${utils.formatPercent(item.percent)}</td>
          <td><span class="badge ${badgeClass}">${item.category}</span></td>
        </tr>
      `;
    }).join('');

    categoryGrid.innerHTML = categories.map(cat => {
      let catColor = '#64748B';
      if (cat.name === 'Qualified') catColor = '#059669';
      else if (cat.name === 'In Progress') catColor = '#D97706';
      else if (cat.name === 'Dead') catColor = '#DC2626';

      return `
        <div class="ftd-category-card">
          <div class="ftd-category-header">
            <span class="ftd-category-name" style="color: ${catColor};">${cat.name}</span>
            <span class="ftd-category-count font-mono">${utils.formatNumber(cat.count)}</span>
          </div>
          <div class="ftd-category-items">
            ${cat.items.map(item => `
              <div class="ftd-category-item">
                <span class="ftd-category-item-name">${item.name}</span>
                <span class="ftd-category-item-count font-mono">${utils.formatNumber(item.count)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  },

  renderAttendance(data) {
    const attendance = analytics.computeAttendance(data);
    const tbody = document.getElementById('attendance-tbody');
    const emptyState = document.getElementById('attendance-empty');

    if (attendance.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
      tbody.innerHTML = attendance.map(a => {
        let statusClass = 'badge-neutral';
        if (a.status === 'Present') statusClass = 'badge-success';
        else if (a.status === 'Late') statusClass = 'badge-warning';
        else if (a.status === 'Absent') statusClass = 'badge-danger';

        return `
          <tr>
            <td><strong>${a.agent}</strong></td>
            <td><span class="badge ${statusClass}">${a.status}</span></td>
            <td class="font-mono">${a.checkIn}</td>
            <td class="font-mono">${a.checkOut}</td>
            <td class="font-mono">${a.hours}</td>
            <td class="font-mono">${a.breakTime}</td>
            <td class="text-muted">${a.notes}</td>
          </tr>
        `;
      }).join('');
    }

    // Monthly attendance
    const monthly = analytics.computeMonthlyAttendance();
    const monthlyTbody = document.getElementById('attendance-monthly-tbody');
    monthlyTbody.innerHTML = monthly.map(m => `
      <tr>
        <td><strong>${m.agent}</strong></td>
        <td class="font-mono text-success">${utils.formatNumber(m.present)}</td>
        <td class="font-mono text-danger">${utils.formatNumber(m.absent)}</td>
        <td class="font-mono text-warning">${utils.formatNumber(m.late)}</td>
        <td class="font-mono">${utils.formatNumber(m.halfDay)}</td>
        <td class="font-mono font-semibold">${m.attendancePct}%</td>
      </tr>
    `).join('');
  },

  filterFTDTable(query) {
    const rows = document.querySelectorAll('#ftd-table tbody tr');
    const q = query.toLowerCase().trim();

    rows.forEach(row => {
      const status = row.cells[0].textContent.toLowerCase();
      const category = row.cells[3].textContent.toLowerCase();
      row.style.display = (!q || status.includes(q) || category.includes(q)) ? '' : 'none';
    });
  },

  // ========================================================================
  // UI Helpers
  // ========================================================================

  showLoading(show) {
    this.elements.loadingOverlay.classList.toggle('hidden', !show);
    this.elements.mainLayout.classList.toggle('hidden', show);
    this.elements.errorBoundary.classList.add('hidden');
  },

  showError(message) {
    this.elements.errorMessage.textContent = message;
    this.elements.errorBoundary.classList.remove('hidden');
    this.elements.mainLayout.classList.add('hidden');
    this.elements.loadingOverlay.classList.add('hidden');
  },

  hideError() {
    this.elements.errorBoundary.classList.add('hidden');
    this.elements.mainLayout.classList.remove('hidden');
  },

  showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        ${this.getToastIcon(type)}
      </svg>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.style.animation = 'slideIn 0.2s reverse';
      setTimeout(() => toast.remove(), 200);
    });

    this.elements.toastContainer.appendChild(toast);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideIn 0.2s reverse';
        setTimeout(() => toast.remove(), 200);
      }
    }, 5000);
  },

  getToastIcon(type) {
    const icons = {
      success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
      error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
      warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
      info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };
    return icons[type] || icons.info;
  },

  exportData() {
    const { date } = state.filters;
    const data = state.filters.period === 'mtd' ? dataLoader.getMTDData() : dataLoader.getFilteredData();

    // Create CSV export
    const exportData = {
      metadata: {
        reportDate: date,
        period: state.filters.period.toUpperCase(),
        generatedAt: new Date().toISOString(),
        totalCalls: data.calls.length,
        totalLeads: data.leads.length,
        totalDump: data.dump.length
      },
      calls: data.calls,
      leads: data.leads
    };

    const csv = this.convertToCSV(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `callwise-report-${date}-${state.filters.period}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    this.showToast('success', 'Export Complete', 'Report downloaded as CSV');
  },

  convertToCSV(data) {
    const sections = [];

    // Metadata section
    sections.push('=== REPORT METADATA ===');
    sections.push(Object.entries(data.metadata).map(([k, v]) => `${k},${v}`).join('\n'));
    sections.push('');

    // Calls section
    if (data.calls.length > 0) {
      sections.push('=== CALLS ===');
      const callHeaders = Object.keys(data.calls[0]);
      sections.push(callHeaders.join(','));
      data.calls.forEach(c => {
        sections.push(callHeaders.map(h => `"${(c[h] || '').toString().replace(/"/g, '""')}"`).join(','));
      });
      sections.push('');
    }

    // Leads section
    if (data.leads.length > 0) {
      sections.push('=== LEADS ===');
      const leadHeaders = Object.keys(data.leads[0]);
      sections.push(leadHeaders.join(','));
      data.leads.forEach(l => {
        sections.push(leadHeaders.map(h => `"${(l[h] || '').toString().replace(/"/g, '""')}"`).join(','));
      });
    }

    return sections.join('\n');
  }
};

// ============================================================================
// Application Initialization
// ============================================================================

async function initApp() {
  // Initialize UI
  ui.init();

  // Set max date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('date-picker').max = today;

  // Load data
  await dataLoader.loadAll();

  // Log startup
  console.log('Callwise Agent Daily Tracker initialized');
  console.log('Available dates:', state.data.dates);
  console.log('Agents:', state.data.agents);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export for debugging
window.CallwiseApp = {
  state,
  utils,
  analytics,
  dataLoader,
  ui,
  charts
};