/* Portable implementation of the exported scikit-learn TF-IDF + multinomial LR.
 * Uses Unicode code points for character n-grams, not UTF-16 code units.
 */
(function (root) {
  'use strict';
  const whitespaceRuns = /[\t\n\v\f\r \u001c-\u001f\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]{2,}/gu;
  function features(model, input) {
    let text = model.lowercase ? String(input).toLowerCase() : String(input);
    let units;
    if (model.analyzer === 'char') units = Array.from(text.replace(whitespaceRuns, ' '));
    else units = text.match(/[\p{L}\p{N}_]{2,}/gu) || [];
    const counts = new Map();
    const [min, max] = model.ngram_range;
    for (let n = min; n <= max; n++) {
      for (let start = 0; start + n <= units.length; start++) {
        const gram = units.slice(start, start + n).join(model.analyzer === 'char' ? '' : ' ');
        if (Object.prototype.hasOwnProperty.call(model.vocabulary, gram)) {
          const j = model.vocabulary[gram];
          counts.set(j, (counts.get(j) || 0) + 1);
        }
      }
    }
    let norm = 0;
    for (const [j, count] of counts) {
      const value = (model.sublinear_tf ? 1 + Math.log(count) : count) * model.idf[j];
      counts.set(j, value); norm += value * value;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [j, value] of counts) counts.set(j, value / norm);
    return counts;
  }
  function predict(model, input) {
    const x = features(model, input);
    const scores = model.intercept.map((bias, c) => {
      let value = bias;
      for (const [j, weight] of x) value += model.coefficients[c][j] * weight;
      return value;
    });
    const max = Math.max(...scores);
    const exp = scores.map(score => Math.exp(score - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    const probabilities = exp.map(value => value / sum);
    const idx = probabilities.indexOf(Math.max(...probabilities));
    return {label: model.classes[idx], level: model.class_names[idx], decisionScores:scores,
      normalizedScores:probabilities,
      probabilities:model.classifier_type==='linear_svm'?null:probabilities,featureCount:x.size};
  }
  root.BasaInference = {features, predict};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BasaInference;
})(typeof globalThis !== 'undefined' ? globalThis : this);
