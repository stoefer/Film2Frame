/**
 * Documenten-venster: lijst + eenvoudige Markdown-weergave.
 */
(function () {
  const api = window.api;
  if (!api) return;

  const navEl = document.getElementById('docs-nav');
  const bodyEl = document.getElementById('docs-body');
  const titleEl = document.getElementById('docs-current-title');
  const windowTitleEl = document.getElementById('docs-window-title');
  const hintEl = document.getElementById('docs-hint');

  let dict = {};
  let docs = [];
  let activeId = null;

  function tr(key, fallback) {
    const v = dict[key];
    return typeof v === 'string' && v.length ? v : (fallback || key);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineMd(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      const safeHref = String(href).replace(/"/g, '');
      if (/^https?:\/\//i.test(safeHref) || /^\.\/|^[A-Za-z0-9_.-]+\.md$/i.test(safeHref)) {
        return '<a href="' + safeHref + '">' + label + '</a>';
      }
      return label;
    });
    return s;
  }

  function markdownToHtml(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let inCode = false;
    let codeBuf = [];
    let listType = null;

    function closeList() {
      if (listType) {
        out.push(listType === 'ol' ? '</ol>' : '</ul>');
        listType = null;
      }
    }

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          codeBuf = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        i++;
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        i++;
        continue;
      }

      if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*[-:| ]+\|/.test(lines[i + 1])) {
        closeList();
        const header = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) {
          rows.push(lines[i].split('|').slice(1, -1).map(function (c) { return c.trim(); }));
          i++;
        }
        out.push('<table><thead><tr>' + header.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>');
        rows.forEach(function (row) {
          out.push('<tr>' + row.map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>');
        });
        out.push('</tbody></table>');
        continue;
      }

      if (/^---+\s*$/.test(line.trim())) {
        closeList();
        out.push('<hr />');
        i++;
        continue;
      }

      const h = /^(#{1,3})\s+(.+)$/.exec(line);
      if (h) {
        closeList();
        const level = h[1].length;
        out.push('<h' + level + '>' + inlineMd(h[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      const ul = /^[-*]\s+(.+)$/.exec(line);
      if (ul) {
        if (listType !== 'ul') {
          closeList();
          out.push('<ul>');
          listType = 'ul';
        }
        out.push('<li>' + inlineMd(ul[1]) + '</li>');
        i++;
        continue;
      }

      const ol = /^\d+\.\s+(.+)$/.exec(line);
      if (ol) {
        if (listType !== 'ol') {
          closeList();
          out.push('<ol>');
          listType = 'ol';
        }
        out.push('<li>' + inlineMd(ol[1]) + '</li>');
        i++;
        continue;
      }

      if (!line.trim()) {
        closeList();
        i++;
        continue;
      }

      closeList();
      out.push('<p>' + inlineMd(line) + '</p>');
      i++;
    }
    closeList();
    if (inCode) {
      out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    }
    return out.join('\n');
  }

  function setActiveButton(id) {
    const buttons = navEl.querySelectorAll('button[data-doc-id]');
    buttons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-doc-id') === id);
    });
  }

  async function loadDoc(id) {
    activeId = id;
    setActiveButton(id);
    titleEl.textContent = '…';
    bodyEl.innerHTML = '<p>' + escapeHtml(tr('docs.loading', 'Laden…')) + '</p>';
    try {
      const res = await api.getDocContent(id);
      if (!res || !res.ok) {
        titleEl.textContent = tr('docs.errorTitle', 'Fout');
        bodyEl.innerHTML = '<p class="docs-error">' + escapeHtml((res && res.error) || tr('docs.loadFailed', 'Document laden mislukt.')) + '</p>';
        return;
      }
      titleEl.textContent = res.title || id;
      bodyEl.innerHTML = markdownToHtml(res.markdown || '');
      bodyEl.scrollTop = 0;
      bodyEl.querySelectorAll('a[href$=".md"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          const href = a.getAttribute('href') || '';
          const base = href.replace(/^\.\//, '').split('/').pop();
          const match = docs.find(function (d) { return d.file === base; });
          if (match) loadDoc(match.id);
        });
      });
    } catch (err) {
      titleEl.textContent = tr('docs.errorTitle', 'Fout');
      bodyEl.innerHTML = '<p class="docs-error">' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>';
    }
  }

  function renderNav() {
    navEl.innerHTML = '';
    docs.forEach(function (doc) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-doc-id', doc.id);
      btn.textContent = tr(doc.titleKey, doc.file);
      btn.addEventListener('click', function () { loadDoc(doc.id); });
      navEl.appendChild(btn);
    });
  }

  async function init() {
    try {
      const locale = (await api.getLocale()) || 'nl';
      document.documentElement.lang = locale === 'en' ? 'en' : 'nl';
      dict = (await api.getTranslations()) || {};
      windowTitleEl.textContent = tr('docs.windowTitle', 'Documenten');
      hintEl.textContent = tr('docs.sidebarHint', 'Kies een document links.');
      docs = (await api.listDocs()) || [];
      renderNav();
      const preferred = locale === 'en' ? 'quickstart' : 'snelstart';
      const first = docs.find(function (d) { return d.id === preferred; }) || docs[0];
      if (first) await loadDoc(first.id);
      else {
        titleEl.textContent = '—';
        bodyEl.innerHTML = '<p class="docs-error">' + escapeHtml(tr('docs.empty', 'Geen documenten gevonden.')) + '</p>';
      }
    } catch (err) {
      bodyEl.innerHTML = '<p class="docs-error">' + escapeHtml(err && err.message ? err.message : String(err)) + '</p>';
    }
  }

  init();
})();
