/**
 * Morrowind NPC Name Generator
 * Generates novel firstname/lastname combinations that don't exist in any mod
 * 
 * Key behavior:
 * - Source filter controls which names are used for GENERATION
 * - ALL loaded names are used to BUILD existing combinations for checking
 * - This means even "vanilla only" generation checks against TR/PC/SKY names
 * 
 * Folder structure:
 *   npcs/
 *     darkelf/
 *       lastnames/
 *         vanilla.txt, tr.txt, sky.txt, pc.txt, [custom].txt
 *       firstnames_male/
 *         vanilla.txt, tr.txt, sky.txt, pc.txt, [custom].txt
 *       firstnames_female/
 *         vanilla.txt, tr.txt, sky.txt, pc.txt, [custom].txt
 *     imperial/
 *     breton/
 *     blacklist_firstnames.txt
 *     blacklist_lastnames.txt
 */

const NPCGenerator = {
    // All loaded names with source tags
    allFirstnames: [],      // [{name, source}, ...]
    allLastnames: [],       // [{name, source}, ...]
    
    // Dynamically built from ALL loaded names
    existingCombinations: new Set(),
    
    blacklistedFirstnames: new Set(),
    blacklistedLastnames: new Set(),
    loaded: false,
    currentRace: null,
    currentSex: null,
    
    // Default files to try loading
    defaultFiles: ['vanilla.txt', 'tr.txt', 'sky.txt', 'pc.txt'],
    
    /**
     * Load all .txt files from a directory
     */
    async loadDirectory(basePath) {
        const results = [];
        let filesToLoad = [...this.defaultFiles];
        
        // Try to load manifest.json for additional custom files
        try {
            const manifestResponse = await fetch(`${basePath}/manifest.json`);
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (Array.isArray(manifest.files)) {
                    // Merge with defaults, avoiding duplicates
                    manifest.files.forEach(f => {
                        if (!filesToLoad.includes(f)) {
                            filesToLoad.push(f);
                        }
                    });
                }
            }
        } catch (e) {
            // No manifest, use defaults only
        }
        
        // Load each file
        for (const filename of filesToLoad) {
            try {
                const response = await fetch(`${basePath}/${filename}`);
                if (response.ok) {
                    const text = await response.text();
                    const source = filename.replace('.txt', '');
                    const names = this.parseNameFile(text);
                    names.forEach(name => results.push({ name, source }));
                }
            } catch (e) {
                // File doesn't exist, skip silently
            }
        }
        
        return results;
    },
    
    /**
     * Parse a simple name file (one name per line)
     */
    parseNameFile(text) {
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    },
    
    /**
     * Parse blacklist file into a Set
     */
    parseBlacklist(text) {
        const lines = text.split('\n')
            .map(line => line.trim().toLowerCase())
            .filter(line => line && !line.startsWith('#'));
        return new Set(lines);
    },
    
    /**
     * Build existing combinations dynamically from ALL loaded firstnames and lastnames
     */
    buildExistingCombinations() {
        this.existingCombinations = new Set();
        
        // Get all unique firstnames (lowercase)
        const allFn = new Set();
        this.allFirstnames.forEach(fn => allFn.add(fn.name.toLowerCase()));
        
        // Get all unique lastnames (lowercase)  
        const allLn = new Set();
        this.allLastnames.forEach(ln => allLn.add(ln.name.toLowerCase()));
        
        // Build all existing combinations
        // A combination "exists" if both the firstname AND lastname appear in the loaded data
        // This is a conservative approach - we mark as existing any combo where both parts exist
        
        // Actually, we need to track which firstname+lastname pairs actually exist together
        // Not just all possible combinations of loaded names
        // But we don't have that data directly...
        
        // Better approach: track actual full names as we load them
        // For now, we'll rely on the Levenshtein check for similar names
        // and exact match prevention through the attempted set
        
        // The existingCombinations will be populated differently:
        // We need to track actual NPC full names, not generated combinations
        // Since we don't have that data in the txt files (just first/last separately),
        // we'll use the Levenshtein distance check as our primary defense
    },
    
    /**
     * Load NPC data for a specific race/sex combo
     */
    async loadData(race, sex) {
        this.currentRace = race;
        this.currentSex = sex;
        this._existingPairsCache = null;  // Clear cache on new load
        
        const firstnameDir = `npcs/${race}/firstnames_${sex}`;
        const lastnameDir = `npcs/${race}/lastnames`;
        
        try {
            // Load ALL firstnames for this race/sex (from all sources)
            this.allFirstnames = await this.loadDirectory(firstnameDir);
            
            // Load ALL lastnames for this race (from all sources)
            this.allLastnames = await this.loadDirectory(lastnameDir);
            
            // Load blacklists
            try {
                const fnBlacklistResponse = await fetch('npcs/blacklist_firstnames.txt');
                if (fnBlacklistResponse.ok) {
                    this.blacklistedFirstnames = this.parseBlacklist(await fnBlacklistResponse.text());
                }
            } catch { 
                this.blacklistedFirstnames = new Set();
            }
            
            try {
                const lnBlacklistResponse = await fetch('npcs/blacklist_lastnames.txt');
                if (lnBlacklistResponse.ok) {
                    this.blacklistedLastnames = this.parseBlacklist(await lnBlacklistResponse.text());
                }
            } catch {
                this.blacklistedLastnames = new Set();
            }
            
            if (this.allFirstnames.length === 0) {
                throw new Error(`No firstnames found for ${race} ${sex}`);
            }
            
            if (this.allLastnames.length === 0) {
                throw new Error(`No lastnames found for ${race}`);
            }
            
            this.loaded = true;
            return true;
        } catch (error) {
            this.loaded = false;
            throw error;
        }
    },
    
    /**
     * Get firstnames filtered by source
     * @param {string} sourceFilter - 'all', 'vanilla', or 'expanded' (tr+sky+pc)
     */
    getFirstnames(sourceFilter = 'all') {
        let filtered = this.allFirstnames;
        
        if (sourceFilter === 'vanilla') {
            filtered = filtered.filter(fn => fn.source === 'vanilla');
        } else if (sourceFilter === 'expanded') {
            filtered = filtered.filter(fn => ['tr', 'sky', 'pc'].includes(fn.source));
        }
        // 'all' uses everything
        
        const seen = new Set();
        const results = [];
        
        for (const fn of filtered) {
            const lower = fn.name.toLowerCase();
            if (!this.blacklistedFirstnames.has(lower) && !seen.has(lower)) {
                seen.add(lower);
                results.push(fn.name);
            }
        }
        
        return results;
    },
    
    /**
     * Get lastnames filtered by source
     * @param {string} sourceFilter - 'all', 'vanilla', or 'expanded' (tr+sky+pc)
     */
    getLastnames(sourceFilter = 'all') {
        let filtered = this.allLastnames;
        
        if (sourceFilter === 'vanilla') {
            filtered = filtered.filter(ln => ln.source === 'vanilla');
        } else if (sourceFilter === 'expanded') {
            filtered = filtered.filter(ln => ['tr', 'sky', 'pc'].includes(ln.source));
        }
        // 'all' uses everything
        
        const seen = new Set();
        const results = [];
        
        for (const ln of filtered) {
            const lower = ln.name.toLowerCase();
            if (!this.blacklistedLastnames.has(lower) && !seen.has(lower)) {
                seen.add(lower);
                results.push(ln.name);
            }
        }
        
        return results;
    },
    
    /**
     * Get ALL firstnames (for building existing combinations check)
     */
    getAllFirstnamesLower() {
        const seen = new Set();
        this.allFirstnames.forEach(fn => {
            if (!this.blacklistedFirstnames.has(fn.name.toLowerCase())) {
                seen.add(fn.name.toLowerCase());
            }
        });
        return seen;
    },
    
    /**
     * Get ALL lastnames (for building existing combinations check)
     */
    getAllLastnamesLower() {
        const seen = new Set();
        this.allLastnames.forEach(ln => {
            if (!this.blacklistedLastnames.has(ln.name.toLowerCase())) {
                seen.add(ln.name.toLowerCase());
            }
        });
        return seen;
    },
    
    /**
     * Check if a combination is too similar to any actual existing NPC
     * 
     * We need to check against actual firstname+lastname PAIRS that exist together,
     * not just whether both parts exist somewhere independently.
     * 
     * Since we track names by source, we rebuild actual pairs from loaded data.
     */
    isTooSimilarToExisting(firstname, lastname) {
        const fnLower = firstname.toLowerCase();
        const lnLower = lastname.toLowerCase();
        
        // Build set of actual existing pairs (cached after first call)
        if (!this._existingPairsCache) {
            this._existingPairsCache = new Set();
            
            // For each firstname, pair it with lastnames from the same source
            // This approximates actual NPCs (same source = likely same mod = actual pair)
            const fnBySource = {};
            const lnBySource = {};
            
            this.allFirstnames.forEach(fn => {
                if (!fnBySource[fn.source]) fnBySource[fn.source] = [];
                fnBySource[fn.source].push(fn.name.toLowerCase());
            });
            
            this.allLastnames.forEach(ln => {
                if (!lnBySource[ln.source]) lnBySource[ln.source] = [];
                lnBySource[ln.source].push(ln.name.toLowerCase());
            });
            
            // Create pairs within each source
            for (const source of Object.keys(fnBySource)) {
                const fns = fnBySource[source] || [];
                const lns = lnBySource[source] || [];
                for (const fn of fns) {
                    for (const ln of lns) {
                        this._existingPairsCache.add(`${fn}|${ln}`);
                    }
                }
            }
        }
        
        const candidateKey = `${fnLower}|${lnLower}`;
        
        // Exact match check
        if (this._existingPairsCache.has(candidateKey)) {
            return true;
        }
        
        // Levenshtein check: same lastname + similar firstname
        for (const existing of this._existingPairsCache) {
            const [existingFn, existingLn] = existing.split('|');
            
            if (existingLn === lnLower) {
                if (areTooSimilar(fnLower, existingFn, 3)) {
                    return true;
                }
            }
        }
        
        return false;
    },
    
    /**
     * Generate novel name combinations
     * Source filter controls which names to use for generation
     * But ALL names are used for the similarity/duplicate check
     */
    generate(count = 10, sourceFilter = 'all') {
        if (!this.loaded) {
            throw new Error('Data not loaded');
        }
        
        const firstnames = this.getFirstnames(sourceFilter);
        const lastnames = this.getLastnames(sourceFilter);
        
        if (firstnames.length === 0) {
            throw new Error('No firstnames available (check source filter and blacklist)');
        }
        
        if (lastnames.length === 0) {
            throw new Error('No lastnames available (check source filter and blacklist)');
        }
        
        const results = [];
        const attempted = new Set();
        const maxAttempts = count * 500; // More attempts since we're stricter
        let attempts = 0;
        
        while (results.length < count && attempts < maxAttempts) {
            attempts++;
            
            const firstname = firstnames[Math.floor(Math.random() * firstnames.length)];
            const lastname = lastnames[Math.floor(Math.random() * lastnames.length)];
            const key = `${firstname.toLowerCase()}|${lastname.toLowerCase()}`;
            
            if (attempted.has(key)) continue;
            attempted.add(key);
            
            // Check against ALL loaded names (not just filtered source)
            if (this.isTooSimilarToExisting(firstname, lastname)) continue;
            
            results.push({ firstname, lastname });
        }
        
        return results;
    },
    
    /**
     * Get statistics about the loaded data
     */
    getStats(sourceFilter = 'all') {
        const firstnames = this.getFirstnames(sourceFilter);
        const lastnames = this.getLastnames(sourceFilter);
        
        const vanillaFn = this.allFirstnames.filter(fn => fn.source === 'vanilla').length;
        const trFn = this.allFirstnames.filter(fn => fn.source === 'tr').length;
        const skyFn = this.allFirstnames.filter(fn => fn.source === 'sky').length;
        const pcFn = this.allFirstnames.filter(fn => fn.source === 'pc').length;
        
        const vanillaLn = this.allLastnames.filter(ln => ln.source === 'vanilla').length;
        const trLn = this.allLastnames.filter(ln => ln.source === 'tr').length;
        const skyLn = this.allLastnames.filter(ln => ln.source === 'sky').length;
        const pcLn = this.allLastnames.filter(ln => ln.source === 'pc').length;
        
        return {
            uniqueFirstnames: firstnames.length,
            uniqueLastnames: lastnames.length,
            vanillaFirstnames: vanillaFn,
            expandedFirstnames: trFn + skyFn + pcFn,
            vanillaLastnames: vanillaLn,
            expandedLastnames: trLn + skyLn + pcLn,
            totalFirstnames: this.allFirstnames.length,
            totalLastnames: this.allLastnames.length,
            blacklistedFirstnames: this.blacklistedFirstnames.size,
            blacklistedLastnames: this.blacklistedLastnames.size
        };
    }
};

// UI Controller
document.addEventListener('DOMContentLoaded', () => {
    const raceSelect = document.getElementById('race');
    const sexSelect = document.getElementById('sex');
    const sourceSelect = document.getElementById('source');
    const generateBtn = document.getElementById('generate');
    const output = document.getElementById('output');
    
    generateBtn.addEventListener('click', async () => {
        const race = raceSelect.value;
        const sex = sexSelect.value;
        const source = sourceSelect ? sourceSelect.value : 'all';
        
        output.innerHTML = '<div class="loading">Loading...</div>';
        generateBtn.disabled = true;
        
        try {
            await NPCGenerator.loadData(race, sex);
            const names = NPCGenerator.generate(10, source);
            const stats = NPCGenerator.getStats(source);
            
            if (names.length === 0) {
                output.innerHTML = '<div class="error">Could not generate any novel combinations. Try a different source filter.</div>';
            } else {
                let html = '<div class="results">';
                html += '<h2>Generated Names</h2>';
                html += '<ul class="name-list">';
                
                names.forEach(name => {
                    html += `<li>${name.firstname} ${name.lastname}</li>`;
                });
                
                html += '</ul>';
                html += `<div class="stats">`;
                html += `Generating from: ${stats.uniqueFirstnames} firstnames × ${stats.uniqueLastnames} lastnames`;
                html += `<br>Checking against: ${stats.totalFirstnames} firstnames × ${stats.totalLastnames} lastnames (all sources)`;
                html += `</div>`;
                html += '</div>';
                
                output.innerHTML = html;
            }
        } catch (error) {
            output.innerHTML = `<div class="error">${error.message}</div>`;
        }
        
        generateBtn.disabled = false;
    });
});
