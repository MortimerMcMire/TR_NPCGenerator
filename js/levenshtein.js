/**
 * Levenshtein distance calculation
 * Returns the minimum number of single-character edits needed
 * to transform string a into string b
 */
function levenshteinDistance(a, b) {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    
    if (aLower === bLower) return 0;
    if (aLower.length === 0) return bLower.length;
    if (bLower.length === 0) return aLower.length;
    
    const matrix = [];
    
    for (let i = 0; i <= bLower.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= aLower.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= bLower.length; i++) {
        for (let j = 1; j <= aLower.length; j++) {
            if (bLower.charAt(i - 1) === aLower.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[bLower.length][aLower.length];
}

/**
 * Check if two names are too similar (Levenshtein distance < threshold)
 */
function areTooSimilar(name1, name2, threshold = 3) {
    return levenshteinDistance(name1, name2) < threshold;
}
