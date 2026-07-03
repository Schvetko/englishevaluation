(function () {
  'use strict';

  var BAND_LABELS = {
    independent: 'Independent',
    supported: 'Supported',
    needs_support: 'Needs support'
  };

  var GAP_LABELS = {
    none: 'None',
    small: 'Small',
    significant: 'Significant'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function fail(msg) {
    $('loading').classList.add('hidden');
    var e = $('error');
    e.textContent = msg;
    e.classList.remove('hidden');
  }

  function scoreItem(label, data) {
    var div = document.createElement('div');
    div.className = 'score-item';

    var l = document.createElement('div');
    l.className = 'label';
    l.textContent = label;

    var v = document.createElement('div');
    v.className = 'value';
    v.textContent = data.score + ' / 5';

    var c = document.createElement('div');
    c.className = 'comment';
    c.textContent = data.comment;

    div.appendChild(l);
    div.appendChild(v);
    div.appendChild(c);
    return div;
  }

  var id = window.location.pathname.split('/').pop();

  fetch('/api/results/' + encodeURIComponent(id))
    .then(function (res) {
      if (res.status === 404) throw new Error('Result not found. Check the link.');
      if (!res.ok) throw new Error('Failed to load result.');
      return res.json();
    })
    .then(function (data) {
      var ev = data.evaluation;

      $('r-name').textContent = data.name;
      $('r-meta').textContent =
        'Completed ' + new Date(data.created_at).toLocaleString();

      var band = $('r-band');
      band.textContent = BAND_LABELS[data.band] || data.band;
      band.classList.add('band-' + data.band);

      $('r-summary').textContent = ev.summary;

      var scores = $('r-scores');
      scores.appendChild(scoreItem('Comprehension', ev.comprehension));
      scores.appendChild(scoreItem('Fluency / production', ev.fluency));
      scores.appendChild(scoreItem('Technical vocabulary (Q1)', ev.technical_vocabulary));

      $('r-gap').textContent =
        GAP_LABELS[ev.everyday_technical_gap.gap] || ev.everyday_technical_gap.gap;
      $('r-gap-comment').textContent = ev.everyday_technical_gap.comment;

      var obsContainer = $('r-observations');
      ev.observations.forEach(function (obs) {
        var div = document.createElement('div');
        div.className = 'observation';

        var issue = document.createElement('div');
        issue.textContent = obs.issue;

        var quote = document.createElement('div');
        quote.className = 'quote';
        quote.textContent = '“' + obs.quote + '”';

        var ref = document.createElement('div');
        ref.className = 'reformulation';
        ref.textContent = '→ ' + obs.reformulation;

        div.appendChild(issue);
        div.appendChild(quote);
        div.appendChild(ref);
        obsContainer.appendChild(div);
      });

      $('r-q1-question').textContent = data.q1.question;
      $('r-q1-transcript').textContent = data.q1.transcript || '(empty)';
      $('r-q2-question').textContent = data.q2.question;
      $('r-q2-transcript').textContent = data.q2.transcript || '(empty)';

      $('loading').classList.add('hidden');
      $('result').classList.remove('hidden');
    })
    .catch(function (err) {
      fail(err.message);
    });
})();
