/**
 * Morrowind NPC Name Generator
 * 
 * Key behavior:
 * - Source filter controls which names are used for GENERATION
 * - ALL fullnames (from all sources) are loaded for duplicate/similarity checking
 * - This means "vanilla only" generation still won't create names that exist in TR
 */

const NPCGenerator = {
    allFirstnames: [],      // [{name, source}, ...]
    allLastnames: [],       // [{name, source}, ...]
    allFullnames: [],       // [{name, source}, ...] - actual existing NPC names
    
    blacklistedFirstnames: new Set(),
    blacklistedLastnames: new Set(),
    loaded: false,
    
    defaultFiles: ['vanilla.txt', 'tr.txt', 'sky.txt', 'pc.txt'],
    
    async loadDirectory(basePath) {
        const results = [];
        let filesToLoad = [...this.defaultFiles];
        
        try {
            const manifestResponse = await fetch(`${basePath}/manifest.json`);
            if (manifestResponse.ok) {
                const manifest = await manifestResponse.json();
                if (Array.isArray(manifest.files)) {
                    manifest.files.forEach(f => {
                        if (!filesToLoad.includes(f)) filesToLoad.push(f);
                    });
                }
            }
        } catch (e) {}
        
        for (const filename of filesToLoad) {
            try {
                const response = await fetch(`${basePath}/${filename}`);
                if (response.ok) {
                    const text = await response.text();
                    const source = filename.replace('.txt', '');
                    const names = this.parseNameFile(text);
                    names.forEach(name => results.push({ name, source }));
                }
            } catch (e) {}
        }
        
        return results;
    },
    
    parseNameFile(text) {
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
    },
    
    parseBlacklist(text) {
        const lines = text.split('\n')
            .map(line => line.trim().toLowerCase())
            .filter(line => line && !line.startsWith('#'));
        return new Set(lines);
    },
    
    async loadData(race, sex) {
        const firstnameDir = `npcs/${race}/firstnames_${sex}`;
        const lastnameDir = `npcs/${race}/lastnames`;
        const fullnameDir = `npcs/${race}/fullnames`;
        
        try {
            this.allFirstnames = await this.loadDirectory(firstnameDir);
            this.allLastnames = await this.loadDirectory(lastnameDir);
            this.allFullnames = await this.loadDirectory(fullnameDir);
            
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
    
    getFirstnames(sourceFilter = 'all') {
        let filtered = this.allFirstnames;
        
        if (sourceFilter === 'vanilla') {
            filtered = filtered.filter(fn => fn.source === 'vanilla');
        } else if (sourceFilter === 'expanded') {
            filtered = filtered.filter(fn => ['tr', 'sky', 'pc'].includes(fn.source));
        }
        
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
    
    getLastnames(sourceFilter = 'all') {
        let filtered = this.allLastnames;
        
        if (sourceFilter === 'vanilla') {
            filtered = filtered.filter(ln => ln.source === 'vanilla');
        } else if (sourceFilter === 'expanded') {
            filtered = filtered.filter(ln => ['tr', 'sky', 'pc'].includes(ln.source));
        }
        
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
     * Check if a combination matches or is too similar to an actual existing NPC
     */
    isTooSimilarToExisting(firstname, lastname) {
        const candidateFull = `${firstname} ${lastname}`.toLowerCase();
        
        for (const existing of this.allFullnames) {
            const existingLower = existing.name.toLowerCase();
            
            // Exact match
            if (candidateFull === existingLower) {
                return true;
            }
            
            // Check Levenshtein for same lastname
            const parts = existingLower.split(' ');
            if (parts.length === 2) {
                const [existingFn, existingLn] = parts;
                
                if (existingLn === lastname.toLowerCase()) {
                    if (areTooSimilar(firstname.toLowerCase(), existingFn, 3)) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    },
    
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
        const maxAttempts = count * 100;
        let attempts = 0;
        
        while (results.length < count && attempts < maxAttempts) {
            attempts++;
            
            const firstname = firstnames[Math.floor(Math.random() * firstnames.length)];
            const lastname = lastnames[Math.floor(Math.random() * lastnames.length)];
            const key = `${firstname.toLowerCase()}|${lastname.toLowerCase()}`;
            
            if (attempted.has(key)) continue;
            attempted.add(key);
            
            if (this.isTooSimilarToExisting(firstname, lastname)) continue;
            
            results.push({ firstname, lastname });
        }
        
        return results;
    },
    
    getStats(sourceFilter = 'all') {
        const firstnames = this.getFirstnames(sourceFilter);
        const lastnames = this.getLastnames(sourceFilter);
        
        return {
            uniqueFirstnames: firstnames.length,
            uniqueLastnames: lastnames.length,
            totalFirstnames: this.allFirstnames.length,
            totalLastnames: this.allLastnames.length,
            existingFullnames: this.allFullnames.length
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
                html += `<br>Checking against: ${stats.existingFullnames} existing NPCs`;
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
