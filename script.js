let allTests = [];
let filteredTests = [];

const GITHUB_API_URL = 'https://api.github.com/repos/WebKit/WebKit/contents/JSTests/test262/expectations.yaml';
const TEST262_BASE_URL = 'https://github.com/tc39/test262/blob/main/';

async function fetchExpectationsYaml() {
    try {
        showLoading(true);
        hideError();
        
        // Fetch file content using GitHub API
        const response = await fetch(GITHUB_API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3.raw'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch expectations.yaml: ${response.status}`);
        }
        
        const yamlContent = await response.text();
        return yamlContent;
    } catch (error) {
        showError(`Error: ${error.message}`);
        throw error;
    } finally {
        showLoading(false);
    }
}

function parseYaml(yamlContent) {
    try {
        const parsed = jsyaml.load(yamlContent);
        const tests = [];
        
        for (const [testPath, modes] of Object.entries(parsed)) {
            const test = {
                path: testPath,
                modes: {}
            };
            
            for (const [mode, error] of Object.entries(modes)) {
                test.modes[mode] = error;
            }
            
            tests.push(test);
        }
        
        return tests;
    } catch (error) {
        showError(`YAML parse error: ${error.message}`);
        throw error;
    }
}

function renderTests(tests) {
    const testList = document.getElementById('testList');
    const content = document.getElementById('content');
    
    if (tests.length === 0) {
        testList.innerHTML = '<div class="no-results">No results found</div>';
        content.style.display = 'block';
        return;
    }
    
    const html = tests.map(test => {
        const modes = Object.keys(test.modes);
        const modeHtml = modes.map(mode => {
            const modeClass = mode === 'default' ? 'default' : 'strict';
            return `<span class="mode-badge ${modeClass}">${mode}</span>`;
        }).join('');
        
        const errorsHtml = Object.entries(test.modes).map(([mode, error]) => {
            return `<div class="error-item">
                <span class="error-mode">${mode}:</span>${escapeHtml(error)}
            </div>`;
        }).join('');
        
        return `
            <div class="test-item">
                <div class="test-header">
                    <a href="${TEST262_BASE_URL}${test.path}" target="_blank" rel="noopener noreferrer" class="test-path">
                        ${test.path}
                    </a>
                    <div class="test-modes">${modeHtml}</div>
                </div>
                <div class="test-errors">${errorsHtml}</div>
            </div>
        `;
    }).join('');
    
    testList.innerHTML = html;
    content.style.display = 'block';
}

function updateStats() {
    const stats = document.getElementById('stats');
    const totalTests = allTests.length;
    const defaultModeCount = allTests.filter(t => 'default' in t.modes).length;
    const strictModeCount = allTests.filter(t => 'strict mode' in t.modes).length;
    
    stats.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Total tests:</span>
            <span class="stat-value">${totalTests}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Default mode:</span>
            <span class="stat-value">${defaultModeCount}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Strict mode:</span>
            <span class="stat-value">${strictModeCount}</span>
        </div>
    `;
}

function filterTests(searchTerm) {
    if (!searchTerm) {
        filteredTests = allTests;
    } else {
        const term = searchTerm.toLowerCase();
        filteredTests = allTests.filter(test => 
            test.path.toLowerCase().includes(term) ||
            Object.values(test.modes).some(error => 
                error.toLowerCase().includes(term)
            )
        );
    }
    renderTests(filteredTests);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showError(message) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadData() {
    try {
        const yamlContent = await fetchExpectationsYaml();
        allTests = parseYaml(yamlContent);
        filteredTests = allTests;
        updateStats();
        renderTests(allTests);
    } catch (error) {
        console.error('Failed to load data:', error);
    }
}

// Set up event listeners
document.getElementById('searchInput').addEventListener('input', (e) => {
    filterTests(e.target.value);
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
});

// Initial load
loadData();