let allTests = [];
let filteredTests = [];
let selectedCategories = new Set();
let allCategories = new Map();
let categoryHierarchy = new Map();
let expandedCategories = new Set();

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
        
        // Extract categories from test paths
        extractCategories(tests);
        
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
    applyFilters();
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

function extractCategories(tests) {
    allCategories.clear();
    categoryHierarchy.clear();
    
    tests.forEach(test => {
        const parts = test.path.split('/');
        let currentPath = '';
        
        // Skip 'test' prefix if present
        const startIdx = parts[0] === 'test' ? 1 : 0;
        
        // Build hierarchical categories (up to 3 levels deep)
        for (let i = startIdx; i < Math.min(parts.length - 1, startIdx + 3); i++) {
            const part = parts[i];
            if (!part) break;
            
            if (currentPath) {
                currentPath += '/';
            }
            currentPath += part;
            
            // Count tests in this category
            allCategories.set(currentPath, (allCategories.get(currentPath) || 0) + 1);
            
            // Build hierarchy - add to parent's children
            const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
            if (parentPath && i > startIdx) {
                if (!categoryHierarchy.has(parentPath)) {
                    categoryHierarchy.set(parentPath, new Set());
                }
                categoryHierarchy.get(parentPath).add(currentPath);
            }
        }
    });
}

function renderCategories() {
    const categoriesContainer = document.getElementById('categories');
    if (!categoriesContainer) return;
    
    // Get top-level categories
    const topLevelCategories = Array.from(allCategories.entries())
        .filter(([path]) => !path.includes('/'))
        .sort((a, b) => b[1] - a[1]);
    
    const html = topLevelCategories.map(([category, count]) => {
        return renderCategoryItem(category, count, 0);
    }).join('');
    
    categoriesContainer.innerHTML = `<div class="category-tree">${html}</div>`;
    
    // Add click handlers
    categoriesContainer.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = e.target.closest('.category-btn').dataset.category;
            toggleCategory(category);
        });
    });
    
    categoriesContainer.querySelectorAll('.category-expand').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = e.target.closest('.category-item').dataset.category;
            toggleExpand(category);
        });
    });
}

function renderCategoryItem(category, count, level) {
    const isSelected = selectedCategories.has(category);
    const hasChildren = categoryHierarchy.has(category);
    const isExpanded = expandedCategories.has(category);
    const displayName = category.split('/').pop();
    
    let html = `<div class="category-item" data-category="${escapeHtml(category)}" style="margin-left: ${level * 20}px;">`;
    
    if (hasChildren) {
        html += `<button class="category-expand ${isExpanded ? 'expanded' : ''}">${isExpanded ? '▼' : '▶'}</button>`;
    } else {
        html += `<span class="category-expand-placeholder"></span>`;
    }
    
    html += `<button class="category-btn ${isSelected ? 'active' : ''}" data-category="${escapeHtml(category)}">
                ${escapeHtml(category)} (${count})
             </button>`;
    
    if (hasChildren && isExpanded) {
        const children = Array.from(categoryHierarchy.get(category))
            .map(child => [child, allCategories.get(child) || 0])
            .sort((a, b) => b[1] - a[1]);
        
        html += '<div class="category-children">';
        children.forEach(([childCategory, childCount]) => {
            html += renderCategoryItem(childCategory, childCount, level + 1);
        });
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function toggleExpand(category) {
    if (expandedCategories.has(category)) {
        expandedCategories.delete(category);
    } else {
        expandedCategories.add(category);
    }
    renderCategories();
}

function toggleCategory(category) {
    if (selectedCategories.has(category)) {
        selectedCategories.delete(category);
    } else {
        selectedCategories.add(category);
    }
    
    applyFilters();
    renderCategories();
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value;
    
    filteredTests = allTests.filter(test => {
        // Apply category filter
        if (selectedCategories.size > 0) {
            // Check if test matches any selected category
            let matches = false;
            const testPathNormalized = test.path.startsWith('test/') ? test.path.substring(5) : test.path;
            
            for (const selectedCategory of selectedCategories) {
                if (testPathNormalized.startsWith(selectedCategory + '/') || testPathNormalized === selectedCategory) {
                    matches = true;
                    break;
                }
            }
            if (!matches) return false;
        }
        
        // Apply text search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return test.path.toLowerCase().includes(term) ||
                   Object.values(test.modes).some(error => 
                       error.toLowerCase().includes(term)
                   );
        }
        
        return true;
    });
    
    renderTests(filteredTests);
}

async function loadData() {
    try {
        const yamlContent = await fetchExpectationsYaml();
        allTests = parseYaml(yamlContent);
        filteredTests = allTests;
        updateStats();
        renderCategories();
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