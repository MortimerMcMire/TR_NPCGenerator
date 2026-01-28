/**
 * Morrowind NPC Name Generator
 * Generates novel firstname/lastname combinations that don't exist in the game
 * Supports both vanilla Morrowind and Tamriel Rebuilt NPCs
 */

const NPCGenerator = {
    npcs: [],
    blacklistedLastnames: new Set(),
    loaded: false,
    
    /**
     * Load NPC data and blacklist for a specific race/sex combo
     */
    async loadData(race, sex) {
        const npcFile = `npcs/${race}_${sex}.txt`;
        const blacklistFile = 'npcs/blacklist.txt';
        
        try {
            // Load NPCs
            const npcResponse = await fetch(npcFile);
            if (!npcResponse.ok) {
                throw new Error(`No data found for ${race} ${sex}`);
            }
            const npcText = await npcResponse.text();
            this.npcs = this.parseNPCFile(npcText);
            
            // Load blacklist
            try {
                const blacklistResponse = await fetch(blacklistFile);
                if (blacklistResponse.ok) {
                    const blacklistText = await blacklistResponse.text();
                    this.blacklistedLastnames = this.parseBlacklist(blacklistText);
                } else {
                    this.blacklistedLastnames = new Set();
                }
            } catch {
                this.blacklistedLastnames = new Set();
            }
            
            this.loaded = true;
            return true;
        } catch (error) {
            this.loaded = false;
            throw error;
        }
    },
    
    /**
     * Parse NPC file into array of {firstname, lastname, source} objects
     * Expected format: "Firstname Lastname | source" (one per line)
     * Also supports old format without source tag
     */
    parseNPCFile(text) {
        const lines = text.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        
        return lines.map(line => {
            // Check for source tag (new format: "Name Name | source")
            let source = 'vanilla';
            let namePart = line;
            
            if (line.includes(' | ')) {
                const pipeIndex = line.lastIndexOf(' | ');
                namePart = line.substring(0, pipeIndex).trim();
                source = line.substring(pipeIndex + 3).trim().toLowerCase();
            }
            
            const parts = namePart.split(/\s+/);
            if (parts.length >= 2) {
                return {
                    firstname: parts[0],
                    lastname: parts.slice(1).join(' '),
                    source: source
                };
            } else if (parts.length === 1) {
                // Single name NPCs (like some Argonians/Khajiit)
                return {
                    firstname: parts[0],
                    lastname: null,
                    source: source
                };
            }
            return null;
        }).filter(npc => npc !== null);
    },
    
    /**
     * Parse blacklist file into a Set of lowercase lastnames
     */
    parseBlacklist(text) {
        const lines = text.split('\n')
            .map(line => line.trim().toLowerCase())
            .filter(line => line && !line.startsWith('#'));
        return new Set(lines);
    },
    
    /**
     * Filter NPCs by source
     * @param {string} sourceFilter - 'all', 'vanilla', or 'tr'
     */
    filterBySource(sourceFilter) {
        if (sourceFilter === 'all') {
            return this.npcs;
        }
        return this.npcs.filter(npc => npc.source === sourceFilter);
    },
    
    /**
     * Get all unique firstnames from loaded NPCs
     * @param {string} sourceFilter - 'all', 'vanilla', or 'tr'
     */
    getFirstnames(sourceFilter = 'all') {
        const filteredNpcs = this.filterBySource(sourceFilter);
        const names = new Set();
        filteredNpcs.forEach(npc => {
            if (npc.firstname) {
                names.add(npc.firstname);
            }
        });
        return Array.from(names);
    },
    
    /**
     * Get all unique lastnames from loaded NPCs (excluding blacklisted)
     * @param {string} sourceFilter - 'all', 'vanilla', or 'tr'
     */
    getLastnames(sourceFilter = 'all') {
        const filteredNpcs = this.filterBySource(sourceFilter);
        const names = new Set();
        filteredNpcs.forEach(npc => {
            if (npc.lastname && !this.blacklistedLastnames.has(npc.lastname.toLowerCase())) {
                names.add(npc.lastname);
            }
        });
        return Array.from(names);
    },
    
    /**
     * Check if a combination is too similar to any existing NPC
     * Uses Levenshtein distance < 3 as the threshold
     * Always checks against ALL npcs regardless of filter (to avoid generating existing names)
     */
    isTooSimilarToExisting(firstname, lastname) {
        const candidateFull = `${firstname} ${lastname}`.toLowerCase();
        
        for (const npc of this.npcs) {
            if (!npc.lastname) continue;
            
            const existingFull = `${npc.firstname} ${npc.lastname}`.toLowerCase();
            
            // Check exact match
            if (candidateFull === existingFull) {
                return true;
            }
            
            // Check if same lastname with similar firstname
            if (npc.lastname.toLowerCase() === lastname.toLowerCase()) {
                if (areTooSimilar(firstname, npc.firstname, 3)) {
                    return true;
                }
            }
        }
        
        return false;
    },
    
    /**
     * Generate novel name combinations
     * @param {number} count - Number of names to generate
     * @param {string} sourceFilter - 'all', 'vanilla', or 'tr'
     * @returns {Array} Array of {firstname, lastname} objects
     */
    generate(count = 10, sourceFilter = 'all') {
        if (!this.loaded) {
            throw new Error('Data not loaded');
        }
        
        const firstnames = this.getFirstnames(sourceFilter);
        const lastnames = this.getLastnames(sourceFilter);
        
        if (firstnames.length === 0) {
            throw new Error('No firstnames available');
        }
        
        if (lastnames.length === 0) {
            throw new Error('No lastnames available (all may be blacklisted)');
        }
        
        const results = [];
        const attempted = new Set();
        const maxAttempts = count * 100; // Prevent infinite loops
        let attempts = 0;
        
        while (results.length < count && attempts < maxAttempts) {
            attempts++;
            
            const firstname = firstnames[Math.floor(Math.random() * firstnames.length)];
            const lastname = lastnames[Math.floor(Math.random() * lastnames.length)];
            const key = `${firstname.toLowerCase()}|${lastname.toLowerCase()}`;
            
            // Skip if we've already tried this exact combination
            if (attempted.has(key)) {
                continue;
            }
            attempted.add(key);
            
            // Skip if too similar to existing (checks ALL npcs, not just filtered)
            if (this.isTooSimilarToExisting(firstname, lastname)) {
                continue;
            }
            
            // Skip if we already have this in our results
            const alreadyInResults = results.some(
                r => r.firstname.toLowerCase() === firstname.toLowerCase() &&
                     r.lastname.toLowerCase() === lastname.toLowerCase()
            );
            if (alreadyInResults) {
                continue;
            }
            
            results.push({ firstname, lastname });
        }
        
        return results;
    },
    
    /**
     * Get statistics about the loaded data
     * @param {string} sourceFilter - 'all', 'vanilla', or 'tr'
     */
    getStats(sourceFilter = 'all') {
        const filteredNpcs = this.filterBySource(sourceFilter);
        const firstnames = this.getFirstnames(sourceFilter);
        const lastnames = this.getLastnames(sourceFilter);
        const totalPossible = firstnames.length * lastnames.length;
        const existing = filteredNpcs.filter(n => n.lastname).length;
        
        const vanillaCount = this.npcs.filter(n => n.source === 'vanilla').length;
        const trCount = this.npcs.filter(n => n.source === 'tr').length;
        
        return {
            totalNPCs: filteredNpcs.length,
            allNPCs: this.npcs.length,
            vanillaNPCs: vanillaCount,
            trNPCs: trCount,
            uniqueFirstnames: firstnames.length,
            uniqueLastnames: lastnames.length,
            blacklistedLastnames: this.blacklistedLastnames.size,
            theoreticalCombinations: totalPossible,
            existingCombinations: existing
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
                output.innerHTML = '<div class="error">Could not generate any novel combinations. All possibilities may be exhausted or too similar to existing names.</div>';
            } else {
                let html = '<div class="results">';
                html += '<h2>Generated Names</h2>';
                html += '<ul class="name-list">';
                
                names.forEach(name => {
                    html += `<li>${name.firstname} ${name.lastname}</li>`;
                });
                
                html += '</ul>';
                html += `<div class="stats">`;
                html += `${stats.uniqueFirstnames} firstnames × ${stats.uniqueLastnames} lastnames available`;
                if (stats.blacklistedLastnames > 0) {
                    html += `<br>${stats.blacklistedLastnames} lastnames blacklisted`;
                }
                html += `<br>${stats.vanillaNPCs} vanilla + ${stats.trNPCs} TR NPCs loaded`;
                html += `</div>`;
                html += '</div>';
                
                output.innerHTML = html;
            }
        } catch (error) {
            output.innerHTML = `<div class="error">${error.message}<br><br>Make sure the file <code>npcs/${race}_${sex}.txt</code> exists.</div>`;
        }
        
        generateBtn.disabled = false;
    });
});
