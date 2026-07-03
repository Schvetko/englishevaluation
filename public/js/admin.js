(function () {
  'use strict';

  var BAND_LABELS = {
    independent: 'Independent',
    supported: 'Supported',
    needs_support: 'Needs support'
  };

  function $(id) {
    return document.getElementById(id);
  }

  fetch('/api/admin/assessments')
    .then(function (res) {
      if (res.status === 401) {
        // Basic auth prompt was cancelled — reload to re-trigger it
        throw new Error('Authentication required. Reload the page and enter the admin password.');
      }
      if (!res.ok) throw new Error('Failed to load assessments.');
      return res.json();
    })
    .then(function (rows) {
      $('loading').classList.add('hidden');
      if (!rows.length) {
        $('empty').classList.remove('hidden');
        return;
      }
      var tbody = $('rows');
      rows.forEach(function (row) {
        var tr = document.createElement('tr');

        var tdName = document.createElement('td');
        tdName.textContent = row.name;

        var tdDate = document.createElement('td');
        tdDate.textContent = new Date(row.created_at).toLocaleString();

        var tdBand = document.createElement('td');
        var band = document.createElement('span');
        band.className = 'band band-' + row.band;
        band.textContent = BAND_LABELS[row.band] || row.band || '—';
        tdBand.appendChild(band);

        var tdLink = document.createElement('td');
        var a = document.createElement('a');
        a.href = '/results/' + row.id;
        a.textContent = 'View result';
        tdLink.appendChild(a);

        tr.appendChild(tdName);
        tr.appendChild(tdDate);
        tr.appendChild(tdBand);
        tr.appendChild(tdLink);
        tbody.appendChild(tr);
      });
      $('table-card').classList.remove('hidden');
    })
    .catch(function (err) {
      $('loading').classList.add('hidden');
      var e = $('error');
      e.textContent = err.message;
      e.classList.remove('hidden');
    });
})();
