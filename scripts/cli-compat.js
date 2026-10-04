// Adapt the shipped CLI at runtime; never modify installed dependencies.
const fs = require('node:fs');
const path = require('node:path');

function install(file, core) {
  const originalMeta = file.meta;
  file.meta = function(filename) {
    const meta = originalMeta.call(this, filename);
    const content = this.data(filename) || '';
    const marker = content.match(/@lc\s+app=(\S+)\s+id=(.*?)\s+lang=(\S+)/);
    if (marker) Object.assign(meta, { app: marker[1], id: marker[2].trim(), lang: marker[3] });
    else {
      const special = path.basename(filename).match(/^((?:LCP|LCR|LCS|面试题|Interview)\s+\d+(?:\.\d+)?)(?:\.|$)/i);
      if (special) meta.id = special[1];
    }
    return meta;
  };
  core.getProblem = function(keyword, translation, callback) {
    if (keyword && typeof keyword === 'object' && keyword.id) return this.next.getProblem(keyword, translation, callback);
    this.getProblems(translation, (error, problems) => {
      if (error) return callback(error);
      const input = String(keyword);
      const id = fs.existsSync(input) ? String(file.meta(input).id) : input;
      // Display IDs and internal IDs can overlap. Only match display ID/slug here.
      const problem = problems.find(p => String(p.fid) === id || p.slug === id || p.name === id);
      if (!problem) return callback('Problem not found!');
      this.next.getProblem(problem, translation, callback);
    });
  };
}
module.exports = { install };
