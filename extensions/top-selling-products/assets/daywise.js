
  (function () {
    'use strict';

    /* ─────────────────────────────────
     HELPERS
  ───────────────────────────────── */
function formatMoney(cents) {
  if (cents === null || cents === undefined) return '';

  // Get store currency, default to USD if not available
  var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';

  // Use Intl.NumberFormat for proper formatting
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(cents / 100);
} 

    // Safely get image URL in desired Shopify size.
    // Works with {src:...}, {url:...} or plain string, and handles CDN URLs.
    function getImgSrc(imgObj, size) {
      var raw = '';
      if (!imgObj) return raw;
      if (typeof imgObj === 'string') {
        raw = imgObj;
      } else {
        raw = imgObj.src || imgObj.url || '';
      }
      if (!raw) return raw;
      // Strip existing size suffix (e.g. _1024x1024, _large, _medium, etc.)
      raw = raw.replace(
        /_(pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d+\w*)(?=\.\w{2,5}(\?|$))/i,
        ''
      );
      // Inject desired size before extension
      if (size === 'large') {
        raw = raw.replace(/(\.\w{2,5})(\?.*)?$/, '_large$1$2');
      }
      if (size === 'medium') {
        raw = raw.replace(/(\.\w{2,5})(\?.*)?$/, '_medium$1$2');
      }
      return raw;
    }

    /* ─────────────────────────────────
     CARD SCROLL / DOTS / ARROWS
  ───────────────────────────────── */
    var track = document.getElementById('luxTrack');
    var btnPrev = document.getElementById('luxPrev');
    var btnNext = document.getElementById('luxNext');
    var dotsEl = document.getElementById('luxDots');
    if (!track) return;

    var cards = Array.from(track.querySelectorAll('.lux-card'));
    var total = cards.length;

    cards.forEach(function (_, i) {
      var d = document.createElement('button');
      d.className = 'lux-dot' + (i === 0 ? ' active' : '');
      d.setAttribute('aria-label', 'Card ' + (i + 1));
      d.addEventListener('click', function () {
        scrollToCard(i);
      });
      dotsEl.appendChild(d);
    });

    function updateDots(idx) {
      Array.from(dotsEl.querySelectorAll('.lux-dot')).forEach(function (d, i) {
        d.classList.toggle('active', i === idx);
      });
    }
    function scrollToCard(idx) {
      var card = cards[idx];
      if (!card) return;
      var off = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
      track.scrollTo({ left: off, behavior: 'smooth' });
    }
    function getVisibleIndex() {
      var tl = track.getBoundingClientRect().left;
      var closest = 0,
        minDist = Infinity;
      cards.forEach(function (c, i) {
        var d = Math.abs(c.getBoundingClientRect().left - tl);
        if (d < minDist) {
          minDist = d;
          closest = i;
        }
      });
      return closest;
    }
    btnNext &&
      btnNext.addEventListener('click', function () {
        scrollToCard(Math.min(getVisibleIndex() + 1, total - 1));
      });
    btnPrev &&
      btnPrev.addEventListener('click', function () {
        scrollToCard(Math.max(getVisibleIndex() - 1, 0));
      });
    var ticking = false;
    track.addEventListener(
      'scroll',
      function () {
        if (!ticking) {
          requestAnimationFrame(function () {
            updateDots(getVisibleIndex());
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );

    /* ─────────────────────────────────
     PER-CARD: QTY + VARIANTS + PRICE
  ───────────────────────────────── */
    cards.forEach(function (card) {
      var infoEl = card.querySelector('.lux-info');
      if (!infoEl) return;

      // Qty
      var minus = card.querySelector('[data-action="minus"]');
      var plus = card.querySelector('[data-action="plus"]');
      var qtyIn = card.querySelector('.lux-qty-input');
      if (plus)
        plus.addEventListener('click', function () {
          qtyIn.value = parseInt(qtyIn.value) + 1;
        });
      if (minus)
        minus.addEventListener('click', function () {
          if (parseInt(qtyIn.value) > 1) qtyIn.value--;
        });

      // Variants
      var variants = [];
      try {
        variants = JSON.parse(infoEl.dataset.variants || '[]');
      } catch (e) {}
      if (!variants.length) return;

      var numOpts = (variants[0].options || []).length;
      var selected = variants[0].options ? variants[0].options.slice() : [];

      // Init selected from first active pill/swatch
      for (var ii = 0; ii < numOpts; ii++) {
        var fa = card.querySelector(
          '.lux-pill[data-option-index="' + ii + '"].active, .lux-swatch[data-option-index="' + ii + '"].active'
        );
        if (fa) selected[ii] = fa.dataset.value;
      }

      function matchVariant() {
        return variants.find(function (v) {
          return (
            v.options &&
            v.options.every(function (o, idx) {
              return o === selected[idx];
            })
          );
        });
      }

function updateCardPrice() { 
  var v = matchVariant(); 
  if (!v) return; 
  var pe = card.querySelector('.lux-price');
   var ce = card.querySelector('.lux-compare');
    if (pe) pe.textContent = formatMoney(v.price);
     if (ce) { 
      if (v.compare_at_price && v.compare_at_price > v.price) 
      { ce.textContent = formatMoney(v.compare_at_price); ce.style.display = ''; } 
      else 
      { ce.style.display = 'none'; } } }

      function updateCardSoldOut() {
        card.querySelectorAll('.lux-pill, .lux-swatch').forEach(function (btn) {
          var optIdx = parseInt(btn.dataset.optionIndex);
          var test = selected.slice();
          test[optIdx] = btn.dataset.value;
          var avail = variants.some(function (v) {
            return (
              v.options &&
              v.options.every(function (o, i) {
                return o === test[i];
              }) &&
              v.available
            );
          });
          // Only mark unavailable if not currently selected
          var isSelected = selected[optIdx] === btn.dataset.value;
          btn.classList.toggle('sold-out', !avail && !isSelected);
        });
      }

      card.querySelectorAll('.lux-pill, .lux-swatch').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.classList.contains('sold-out')) return;
          var optIdx = parseInt(btn.dataset.optionIndex);
          selected[optIdx] = btn.dataset.value;
          card
            .querySelectorAll(
              '.lux-pill[data-option-index="' + optIdx + '"], .lux-swatch[data-option-index="' + optIdx + '"]'
            )
            .forEach(function (b) {
              b.classList.remove('active');
            });
          btn.classList.add('active');
          updateCardPrice();
          updateCardSoldOut();
        });
      });

      updateCardPrice();
      updateCardSoldOut();

      // Store for QV
      card._luxVariants = variants;
      card._luxSelected = selected;
    });

    /* ─────────────────────────────────
     QUICK VIEW MODAL
  ───────────────────────────────── */
    var backdrop = document.getElementById('qvBackdrop');
    var modal = document.getElementById('qvModal');
    var closeBtn = document.getElementById('qvClose');
    var qvTitleEl = document.getElementById('qvTitle');
    var qvPriceEl = document.getElementById('qvPrice');
    var qvCompareEl = document.getElementById('qvCompare');
    var qvVariantsEl = document.getElementById('qvVariants');
    var qvThumbsEl = document.getElementById('qvThumbs');
    var qvMainImg = document.getElementById('qvMainImg');
    var qvQty = document.getElementById('qvQty');
    var qvAtcBtn = document.getElementById('qvAtcBtn');
    var qvAtcText = document.getElementById('qvAtcText');
    var qvLinkEl = document.getElementById('qvLink');
    var qvImgPrev = document.getElementById('qvImgPrev');
    var qvImgNext = document.getElementById('qvImgNext');
    var qvImgCounter = document.getElementById('qvImgCounter');

    var qvState = { variants: [], selected: [], images: [], optionNames: [], currentImgIdx: 0 };

    /* Image slider */
    function showQVImage(idx) {
      var imgs = qvState.images;
      if (!imgs || !imgs.length) return;
      idx = Math.max(0, Math.min(idx, imgs.length - 1));
      qvState.currentImgIdx = idx;

      var src = getImgSrc(imgs[idx], 'large');
      if (src) {
        qvMainImg.style.opacity = '0.4';
        qvMainImg.src = src;
        qvMainImg.alt = imgs[idx].alt || '';
        setTimeout(function () {
          qvMainImg.style.opacity = '1';
        }, 80);
      }

      // Sync thumbs
      Array.from(qvThumbsEl.querySelectorAll('.qv-thumb')).forEach(function (t, i) {
        t.classList.toggle('active', i === idx);
      });
      // Sync dots
      if (qvImgCounter) {
        Array.from(qvImgCounter.querySelectorAll('.qv-img-dot')).forEach(function (d, i) {
          d.classList.toggle('active', i === idx);
        });
      }
      // Arrow states
      if (qvImgPrev) qvImgPrev.disabled = idx === 0;
      if (qvImgNext) qvImgNext.disabled = idx >= imgs.length - 1;
    }

    if (qvImgPrev)
      qvImgPrev.addEventListener('click', function () {
        showQVImage(qvState.currentImgIdx - 1);
      });
    if (qvImgNext)
      qvImgNext.addEventListener('click', function () {
        showQVImage(qvState.currentImgIdx + 1);
      });

    /* Open modal */
    function openQV(card) {
      var info = card.querySelector('.lux-info');
      if (!info) return;

      var variants = card._luxVariants || [];
      var selected = card._luxSelected ? card._luxSelected.slice() : [];
      var images = [];
      try {
        images = JSON.parse(info.dataset.images || '[]');
      } catch (e) {}

      // Real option names from Liquid data attribute "Size|Color|Style"
      var optionNames = [];
      try {
        var rawNames = (info.dataset.optionNames || '').trim();
        if (rawNames)
          optionNames = rawNames.split('|').map(function (n) {
            return n.trim();
          });
      } catch (e) {}

      // Filter valid images
      var validImgs = images.filter(function (img) {
        return img && (img.src || img.url);
      });

      qvState = {
        variants: variants,
        selected: selected,
        images: validImgs,
        optionNames: optionNames,
        currentImgIdx: 0,
      };

      // Title & link
      qvTitleEl.textContent = info.dataset.productTitle || '';
      qvLinkEl.href = info.dataset.productUrl || '#';

      // Build image gallery
      qvThumbsEl.innerHTML = '';
      qvMainImg.src = '';
      if (qvImgCounter) qvImgCounter.innerHTML = '';
      if (qvImgPrev) {
        qvImgPrev.style.display = '';
        qvImgPrev.disabled = true;
      }
      if (qvImgNext) {
        qvImgNext.style.display = '';
        qvImgNext.disabled = true;
      }

      if (validImgs.length) {
        validImgs.forEach(function (img, i) {
          // Thumbnail
          var tb = document.createElement('div');
          tb.className = 'qv-thumb' + (i === 0 ? ' active' : '');
          var im = document.createElement('img');
          im.src = getImgSrc(img, 'medium') || getImgSrc(img, 'large');
          im.alt = img.alt || '';
          im.loading = 'lazy';
          tb.appendChild(im);
          (function (capturedIdx) {
            tb.addEventListener('click', function () {
              showQVImage(capturedIdx);
            });
          })(i);
          qvThumbsEl.appendChild(tb);

          // Dot
          if (qvImgCounter) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'qv-img-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', 'Image ' + (i + 1));
            (function (capturedIdx) {
              dot.addEventListener('click', function () {
                showQVImage(capturedIdx);
              });
            })(i);
            qvImgCounter.appendChild(dot);
          }
        });

        showQVImage(0);
      } else {
        // Fallback: card image
        var cardImg = card.querySelector('.lux-img');
        if (cardImg && cardImg.src) {
          qvMainImg.src = cardImg.src;
          qvMainImg.alt = cardImg.alt || '';
        }
        if (qvImgPrev) qvImgPrev.style.display = 'none';
        if (qvImgNext) qvImgNext.style.display = 'none';
      }

      // Render variant selectors
      renderQVVariants();

      // Price
      updateQVPrice();

      // Reset qty & button
      qvQty.value = 1;
      qvAtcText.textContent = 'Add to Cart';
      qvAtcBtn.classList.remove('loading', 'success');
      qvAtcBtn.style.background = '';

      // Open
      backdrop.classList.add('open');
      modal.classList.add('open');
      backdrop.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeQV() {
      backdrop.classList.remove('open');
      modal.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    /* Render variant option groups — uses real optionNames */
    function renderQVVariants() {
      qvVariantsEl.innerHTML = '';
      var variants = qvState.variants;
      var selected = qvState.selected;
      var optionNames = qvState.optionNames;
      if (!variants.length) return;

      var numOptions = (variants[0].options || []).length;

      for (var i = 0; i < numOptions; i++) {
        // Collect unique values for this option
        var values = [];
        variants.forEach(function (v) {
          if (v.options && v.options[i] !== undefined) {
            if (values.indexOf(v.options[i]) === -1) values.push(v.options[i]);
          }
        });

        var rawName = optionNames[i] || 'Option ' + (i + 1);
        var nameLower = rawName.toLowerCase();
        var isColor = nameLower === 'color' || nameLower === 'colour';

        var wrap = document.createElement('div');
        wrap.className = 'qv-option-group';

        var label = document.createElement('p');
        label.className = 'qv-option-label';
        // Capitalize: "color" → "Color", "size" → "Size"
        label.textContent = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        wrap.appendChild(label);

        // Use IIFE to capture i correctly for each iteration
        (function (optIdx, optValues, colorMode) {
          if (colorMode) {
            var sw = document.createElement('div');
            sw.className = 'qv-swatches';
            optValues.forEach(function (val) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'qv-swatch' + (selected[optIdx] === val ? ' active' : '');
              btn.dataset.value = val;
              btn.dataset.optionIndex = optIdx;
              btn.style.background = val.toLowerCase();
              btn.title = val;
              btn.setAttribute('aria-label', val);
              btn.addEventListener('click', function () {
                handleQVClick(btn, optIdx);
              });
              sw.appendChild(btn);
            });
            wrap.appendChild(sw);
          } else {
            var pl = document.createElement('div');
            pl.className = 'qv-pills';
            optValues.forEach(function (val) {
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'qv-pill' + (selected[optIdx] === val ? ' active' : '');
              btn.dataset.value = val;
              btn.dataset.optionIndex = optIdx;
              btn.textContent = val;
              btn.addEventListener('click', function () {
                handleQVClick(btn, optIdx);
              });
              pl.appendChild(btn);
            });
            wrap.appendChild(pl);
          }
        })(i, values, isColor);

        qvVariantsEl.appendChild(wrap);
      }

      refreshQVSoldOut();
    }

    function handleQVClick(btn, optIdx) {
      if (btn.classList.contains('sold-out')) return;
      var val = btn.dataset.value;
      qvState.selected[optIdx] = val;

      // Deselect others in same group, select clicked
      qvVariantsEl.querySelectorAll('[data-option-index="' + optIdx + '"]').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      updateQVPrice();
      refreshQVSoldOut();
    }

    function matchQVVariant() {
      var variants = qvState.variants;
      var selected = qvState.selected;
      return variants.find(function (v) {
        return (
          v.options &&
          v.options.every(function (o, i) {
            return o === selected[i];
          })
        );
      });
    }

    function updateQVPrice() {
      var v = matchQVVariant();
      if (!v) return;
      qvPriceEl.textContent = formatMoney(v.price);
      if (v.compare_at_price && v.compare_at_price > v.price) {
        qvCompareEl.textContent = formatMoney(v.compare_at_price);
        qvCompareEl.style.display = '';
      } else {
        qvCompareEl.textContent = '';
        qvCompareEl.style.display = 'none';
      }
    }

    function refreshQVSoldOut() {
      var variants = qvState.variants;
      var selected = qvState.selected;
      qvVariantsEl.querySelectorAll('.qv-pill, .qv-swatch').forEach(function (btn) {
        var optIdx = parseInt(btn.dataset.optionIndex);
        var val = btn.dataset.value;
        var isSelected = selected[optIdx] === val;

        // Build test combination with this value
        var test = selected.slice();
        test[optIdx] = val;

        var avail = variants.some(function (v) {
          return (
            v.options &&
            v.options.every(function (o, i) {
              return o === test[i];
            }) &&
            v.available
          );
        });

        // Never mark the currently selected button as sold-out
        btn.classList.toggle('sold-out', !avail && !isSelected);
      });
    }

    /* QV Qty */
    if (qvQty) {
      document.querySelectorAll('.qv-qty-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.dataset.action;
          var val = parseInt(qvQty.value) || 1;
          if (action === 'plus') qvQty.value = val + 1;
          if (action === 'minus' && val > 1) qvQty.value = val - 1;
        });
      });
    }

    /* QV Add to Cart */
    if (qvAtcBtn) {
      qvAtcBtn.addEventListener('click', function () {
        var v = matchQVVariant();
        if (!v) return;
        if (!v.available) {
          qvAtcText.textContent = 'Sold Out';
          return;
        }

        qvAtcBtn.classList.add('loading');
        qvAtcText.textContent = 'Adding...';

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: v.id, quantity: parseInt(qvQty.value) || 1 }),
        })
          .then(function (res) {
            if (res.ok) {
              qvAtcBtn.classList.remove('loading');
              qvAtcBtn.classList.add('success');
              qvAtcBtn.style.background = '#2d6a4f';
              qvAtcText.textContent = 'Added ✓';
              setTimeout(function () {
                closeQV();
                document.dispatchEvent(new CustomEvent('cart:open'));
                var cartIcon = document.querySelector(
                  '[href="/cart"], .cart-icon, #cart-icon, .js-cart-trigger, [data-cart-toggle], .header__icon--cart'
                );
                if (cartIcon) cartIcon.click();
              }, 800);
            } else {
              qvAtcBtn.classList.remove('loading');
              qvAtcText.textContent = 'Try Again';
            }
          })
          .catch(function () {
            qvAtcBtn.classList.remove('loading');
            qvAtcText.textContent = 'Error';
          });
      });
    }

    /* Open QV trigger */
    cards.forEach(function (card) {
      var trigger = card.querySelector('.lux-qv-trigger');
      if (trigger) {
        trigger.addEventListener('click', function () {
          openQV(card);
        });
      }
    });

    /* Close */
    if (closeBtn) closeBtn.addEventListener('click', closeQV);
    if (backdrop)
      backdrop.addEventListener('click', function (e) {
        // Only close if clicking the backdrop directly (not the modal)
        if (e.target === backdrop) closeQV();
      });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeQV();
    });
  })();
