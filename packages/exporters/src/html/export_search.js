// Progressive enhancement for the static HTML export.
//
// The exported page is fully usable with JavaScript disabled. This script only
// *adds* a convenience: a search box that filters the table-of-contents. If it
// does not run (JS blocked), the search box stays hidden and everything else
// keeps working.
(function () {
    "use strict";

    var wrap = document.querySelector(".ml-search-wrap");
    var input = document.getElementById("ml-search");
    var toc = document.getElementById("ml-toc");
    if (!wrap || !input || !toc) {
        return;
    }

    // Reveal the search box now that JS is available.
    wrap.hidden = false;

    // Index every TOC link by its lowercased text.
    var links = Array.prototype.slice.call(toc.querySelectorAll("a[data-toc]"));
    var entries = links.map(function (a) {
        return { a: a, li: a.closest("li") || a.parentElement, text: (a.textContent || "").toLowerCase() };
    });

    function openAncestors(el) {
        var d = el.closest("details");
        while (d) {
            d.open = true;
            d = d.parentElement ? d.parentElement.closest("details") : null;
        }
    }

    function apply() {
        var q = input.value.trim().toLowerCase();
        if (!q) {
            entries.forEach(function (e) {
                if (e.li) { e.li.classList.remove("ml-hidden"); }
            });
            return;
        }
        entries.forEach(function (e) {
            var hit = e.text.indexOf(q) !== -1;
            if (e.li) { e.li.classList.toggle("ml-hidden", !hit); }
            if (hit) { openAncestors(e.a); }
        });
    }

    var t;
    input.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(apply, 80);
    });
    input.addEventListener("search", apply);
})();
