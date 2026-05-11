/* eslint-disable no-empty, no-inner-declarations */
(function () {
  "use strict";

  function formatMoney(cents) {
    if (cents === null || cents === undefined) return "";

    var currency =
      (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || "USD";

    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  function getImgSrc(imgObj, size) {
    var raw = "";
    if (!imgObj) return raw;

    if (typeof imgObj === "string") {
      raw = imgObj;
    } else {
      raw =
        imgObj.src ||
        imgObj.url ||
        imgObj.originalSrc ||
        imgObj.transformedSrc ||
        (imgObj.preview_image && imgObj.preview_image.src) ||
        (imgObj.featured_image && imgObj.featured_image.src) ||
        "";
    }

    if (!raw) return raw;

    raw = raw.replace(
      /_(pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d+\w*)(?=\.\w{2,5}(\?|$))/i,
      "",
    );

    if (size === "large") {
      raw = raw.replace(/(\.\w{2,5})(\?.*)?$/, "_large$1$2");
    }
    if (size === "medium") {
      raw = raw.replace(/(\.\w{2,5})(\?.*)?$/, "_medium$1$2");
    }

    return raw;
  }

  function normalizeImages(images) {
    var list = Array.isArray(images) ? images : [];
    var seen = {};

    return list
      .map(function (img) {
        if (!img) return null;

        var src = getImgSrc(img, "large");
        if (!src || seen[src]) return null;
        seen[src] = true;

        return {
          src: src,
          alt:
            (typeof img === "object" && (img.alt || img.altText || img.title)) || "",
        };
      })
      .filter(Boolean);
  }

  function createArrowSvg(direction) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      (direction === "prev"
        ? '<path d="M15 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        : '<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      "</svg>"
    );
  }

  function initLuxRoot(root) {
    var track = root.querySelector(".lux-track");
    if (!track) return;

    var btnPrev = root.querySelector(".lux-arrow--prev");
    var btnNext = root.querySelector(".lux-arrow--next");
    var dotsEl = root.querySelector(".lux-dots");
    var cards = Array.from(track.querySelectorAll(".lux-card"));
    var total = cards.length;
    var sliderEnabled = !!dotsEl;

    function updateDots(idx) {
      if (!dotsEl) return;
      Array.from(dotsEl.querySelectorAll(".lux-dot")).forEach(function (dot, i) {
        dot.classList.toggle("active", i === idx);
      });
    }

    function scrollToCard(idx) {
      var card = cards[idx];
      if (!card) return;
      var off = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
      track.scrollTo({ left: off, behavior: "smooth" });
    }

    function getVisibleIndex() {
      var trackLeft = track.getBoundingClientRect().left;
      var closest = 0;
      var minDist = Infinity;

      cards.forEach(function (card, i) {
        var dist = Math.abs(card.getBoundingClientRect().left - trackLeft);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      });

      return closest;
    }

    if (sliderEnabled) {
      dotsEl.innerHTML = "";
      cards.forEach(function (_, i) {
        var dot = document.createElement("button");
        dot.className = "lux-dot" + (i === 0 ? " active" : "");
        dot.setAttribute("aria-label", "Card " + (i + 1));
        dot.addEventListener("click", function () {
          scrollToCard(i);
        });
        dotsEl.appendChild(dot);
      });
    }

    if (sliderEnabled && btnNext) {
      btnNext.addEventListener("click", function () {
        scrollToCard(Math.min(getVisibleIndex() + 1, total - 1));
      });
    }

    if (sliderEnabled && btnPrev) {
      btnPrev.addEventListener("click", function () {
        scrollToCard(Math.max(getVisibleIndex() - 1, 0));
      });
    }

    var ticking = false;
    if (sliderEnabled) {
      track.addEventListener(
        "scroll",
        function () {
          if (!ticking) {
            requestAnimationFrame(function () {
              updateDots(getVisibleIndex());
              ticking = false;
            });
            ticking = true;
          }
        },
        { passive: true },
      );
    }

    cards.forEach(function (card) {
      var infoEl = card.querySelector(".lux-info");
      if (!infoEl) return;

      var wrap = card.querySelector(".lux-img-wrap");
      var imageEl = card.querySelector(".lux-img");

      if (wrap && imageEl) {
        var cardImages = [];
        try {
          cardImages = JSON.parse(infoEl.dataset.images || "[]");
        } catch {}

        var validCardImages = normalizeImages(cardImages);

        if (validCardImages.length > 1) {
          var cardImgIndex = 0;
          var originalImage = {
            src: imageEl.src,
            alt: imageEl.alt || infoEl.dataset.productTitle || "",
          };
          var sliderTrack = document.createElement("div");
          sliderTrack.className = "lux-img-slider";

          [originalImage]
            .concat(
              validCardImages.filter(function (img) {
                return img.src !== originalImage.src;
              }),
            )
            .forEach(function (imgObj) {
              var slide = document.createElement("div");
              slide.className = "lux-img-slide";

              var slideImg = document.createElement("img");
              slideImg.className = "lux-img";
              slideImg.src = imgObj.src;
              slideImg.alt = imgObj.alt || infoEl.dataset.productTitle || "";
              slideImg.loading = "lazy";
              slideImg.width = imageEl.width || 500;
              slideImg.height = imageEl.height || 667;

              slide.appendChild(slideImg);
              sliderTrack.appendChild(slide);
            });

          imageEl.remove();
          wrap.insertBefore(sliderTrack, wrap.firstChild);
          validCardImages = Array.from(sliderTrack.querySelectorAll(".lux-img-slide img")).map(function (img) {
            return { src: img.src, alt: img.alt || "" };
          });

          var prevBtn = document.createElement("button");
          prevBtn.type = "button";
          prevBtn.className = "lux-card-media-arrow lux-card-media-arrow--prev";
          prevBtn.setAttribute("aria-label", "Previous image");
          prevBtn.innerHTML = createArrowSvg("prev");

          var nextBtn = document.createElement("button");
          nextBtn.type = "button";
          nextBtn.className = "lux-card-media-arrow lux-card-media-arrow--next";
          nextBtn.setAttribute("aria-label", "Next image");
          nextBtn.innerHTML = createArrowSvg("next");

          function renderCardImage(index) {
            cardImgIndex = Math.max(0, Math.min(index, validCardImages.length - 1));
            sliderTrack.style.transform = "translateX(-" + cardImgIndex * 100 + "%)";
            prevBtn.disabled = cardImgIndex === 0;
            nextBtn.disabled = cardImgIndex >= validCardImages.length - 1;
          }

          prevBtn.addEventListener("click", function () {
            renderCardImage(cardImgIndex - 1);
          });

          nextBtn.addEventListener("click", function () {
            renderCardImage(cardImgIndex + 1);
          });

          wrap.appendChild(prevBtn);
          wrap.appendChild(nextBtn);
          renderCardImage(0);
        }
      }

      var minus = card.querySelector('[data-action="minus"]');
      var plus = card.querySelector('[data-action="plus"]');
      var qtyIn = card.querySelector(".lux-qty-input");

      if (plus && qtyIn) {
        plus.addEventListener("click", function () {
          qtyIn.value = parseInt(qtyIn.value, 10) + 1;
        });
      }

      if (minus && qtyIn) {
        minus.addEventListener("click", function () {
          if (parseInt(qtyIn.value, 10) > 1) qtyIn.value--;
        });
      }

      var variants = [];
      try {
        variants = JSON.parse(infoEl.dataset.variants || "[]");
      } catch {}
      if (!variants.length) return;

      var numOpts = (variants[0].options || []).length;
      var selected = variants[0].options ? variants[0].options.slice() : [];

      for (var ii = 0; ii < numOpts; ii++) {
        var firstActive = card.querySelector(
          '.lux-pill[data-option-index="' + ii + '"].active, .lux-swatch[data-option-index="' + ii + '"].active',
        );
        if (firstActive) selected[ii] = firstActive.dataset.value;
      }

      function matchVariant() {
        return variants.find(function (variant) {
          return (
            variant.options &&
            variant.options.every(function (option, idx) {
              return option === selected[idx];
            })
          );
        });
      }

      function updateCardPrice() {
        var variant = matchVariant();
        if (!variant) return;

        var priceEl = card.querySelector(".lux-price");
        var compareEl = card.querySelector(".lux-compare");

        if (priceEl) priceEl.textContent = formatMoney(variant.price);
        if (compareEl) {
          if (variant.compare_at_price && variant.compare_at_price > variant.price) {
            compareEl.textContent = formatMoney(variant.compare_at_price);
            compareEl.style.display = "";
          } else {
            compareEl.style.display = "none";
          }
        }
      }

      function updateCardSoldOut() {
        card.querySelectorAll(".lux-pill, .lux-swatch").forEach(function (btn) {
          var optIdx = parseInt(btn.dataset.optionIndex, 10);
          var test = selected.slice();
          test[optIdx] = btn.dataset.value;
          var available = variants.some(function (variant) {
            return (
              variant.options &&
              variant.options.every(function (option, i) {
                return option === test[i];
              }) &&
              variant.available
            );
          });
          var isSelected = selected[optIdx] === btn.dataset.value;
          btn.classList.toggle("sold-out", !available && !isSelected);
        });
      }

      card.querySelectorAll(".lux-pill, .lux-swatch").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.classList.contains("sold-out")) return;

          var optIdx = parseInt(btn.dataset.optionIndex, 10);
          selected[optIdx] = btn.dataset.value;

          card
            .querySelectorAll(
              '.lux-pill[data-option-index="' + optIdx + '"], .lux-swatch[data-option-index="' + optIdx + '"]',
            )
            .forEach(function (peer) {
              peer.classList.remove("active");
            });

          btn.classList.add("active");
          updateCardPrice();
          updateCardSoldOut();
        });
      });

      updateCardPrice();
      updateCardSoldOut();

      card._luxVariants = variants;
      card._luxSelected = selected;
    });

    var backdrop = root.querySelector(".qv-backdrop");
    var modal = root.querySelector(".qv-modal");
    if (!backdrop || !modal) return;

    var closeBtn = modal.querySelector(".qv-close");
    var qvTitleEl = modal.querySelector(".qv-title");
    var qvPriceEl = modal.querySelector(".qv-price");
    var qvCompareEl = modal.querySelector(".qv-compare");
    var qvVariantsEl = modal.querySelector(".qv-variants");
    var qvThumbsEl = modal.querySelector(".qv-thumbs");
    var qvMainImg = modal.querySelector(".qv-main-img");
    var qvQty = modal.querySelector(".qv-qty-input");
    var qvAtcBtn = modal.querySelector(".qv-atc-btn");
    var qvAtcText = modal.querySelector("[data-qv-atc-text]");
    var qvLinkEl = modal.querySelector(".qv-link");
    var qvImgPrev = modal.querySelector(".qv-img-prev");
    var qvImgNext = modal.querySelector(".qv-img-next");
    var qvImgCounter = modal.querySelector(".qv-img-counter");

    var qvState = { variants: [], selected: [], images: [], optionNames: [], currentImgIdx: 0 };

    if (backdrop.parentNode !== document.body) {
      document.body.appendChild(backdrop);
    }
    if (modal.parentNode !== document.body) {
      document.body.appendChild(modal);
    }

    function showQVImage(idx) {
      var imgs = qvState.images;
      if (!imgs || !imgs.length || !qvMainImg) return;

      idx = Math.max(0, Math.min(idx, imgs.length - 1));
      qvState.currentImgIdx = idx;

      var src = getImgSrc(imgs[idx], "large");
      if (src) {
        qvMainImg.style.opacity = "0.4";
        qvMainImg.src = src;
        qvMainImg.alt = imgs[idx].alt || "";
        setTimeout(function () {
          qvMainImg.style.opacity = "1";
        }, 80);
      }

      if (qvThumbsEl) {
        Array.from(qvThumbsEl.querySelectorAll(".qv-thumb")).forEach(function (thumb, i) {
          thumb.classList.toggle("active", i === idx);
        });
      }
      if (qvImgCounter) {
        Array.from(qvImgCounter.querySelectorAll(".qv-img-dot")).forEach(function (dot, i) {
          dot.classList.toggle("active", i === idx);
        });
      }
      if (qvImgPrev) qvImgPrev.disabled = idx === 0;
      if (qvImgNext) qvImgNext.disabled = idx >= imgs.length - 1;
    }

    if (qvImgPrev) {
      qvImgPrev.addEventListener("click", function () {
        showQVImage(qvState.currentImgIdx - 1);
      });
    }

    if (qvImgNext) {
      qvImgNext.addEventListener("click", function () {
        showQVImage(qvState.currentImgIdx + 1);
      });
    }

    function closeQV() {
      backdrop.classList.remove("open");
      modal.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function matchQVVariant() {
      return qvState.variants.find(function (variant) {
        return (
          variant.options &&
          variant.options.every(function (option, i) {
            return option === qvState.selected[i];
          })
        );
      });
    }

    function updateQVPrice() {
      var variant = matchQVVariant();
      if (!variant) return;

      if (qvPriceEl) qvPriceEl.textContent = formatMoney(variant.price);
      if (qvCompareEl) {
        if (variant.compare_at_price && variant.compare_at_price > variant.price) {
          qvCompareEl.textContent = formatMoney(variant.compare_at_price);
          qvCompareEl.style.display = "";
        } else {
          qvCompareEl.textContent = "";
          qvCompareEl.style.display = "none";
        }
      }
    }

    function refreshQVSoldOut() {
      if (!qvVariantsEl) return;

      qvVariantsEl.querySelectorAll(".qv-pill, .qv-swatch").forEach(function (btn) {
        var optIdx = parseInt(btn.dataset.optionIndex, 10);
        var val = btn.dataset.value;
        var isSelected = qvState.selected[optIdx] === val;
        var test = qvState.selected.slice();
        test[optIdx] = val;

        var available = qvState.variants.some(function (variant) {
          return (
            variant.options &&
            variant.options.every(function (option, i) {
              return option === test[i];
            }) &&
            variant.available
          );
        });

        btn.classList.toggle("sold-out", !available && !isSelected);
      });
    }

    function handleQVClick(btn, optIdx) {
      if (btn.classList.contains("sold-out")) return;

      qvState.selected[optIdx] = btn.dataset.value;
      qvVariantsEl.querySelectorAll('[data-option-index="' + optIdx + '"]').forEach(function (peer) {
        peer.classList.remove("active");
      });
      btn.classList.add("active");

      updateQVPrice();
      refreshQVSoldOut();
    }

    function renderQVVariants() {
      if (!qvVariantsEl || !qvState.variants.length) return;

      qvVariantsEl.innerHTML = "";
      var numOptions = (qvState.variants[0].options || []).length;

      for (var i = 0; i < numOptions; i++) {
        var values = [];
        qvState.variants.forEach(function (variant) {
          if (variant.options && variant.options[i] !== undefined && values.indexOf(variant.options[i]) === -1) {
            values.push(variant.options[i]);
          }
        });

        var rawName = qvState.optionNames[i] || "Option " + (i + 1);
        var nameLower = rawName.toLowerCase();
        var isColor = nameLower === "color" || nameLower === "colour";

        var wrap = document.createElement("div");
        wrap.className = "qv-option-group";

        var label = document.createElement("p");
        label.className = "qv-option-label";
        label.textContent = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        wrap.appendChild(label);

        (function (optIdx, optValues, colorMode) {
          if (colorMode) {
            var swatches = document.createElement("div");
            swatches.className = "qv-swatches";
            optValues.forEach(function (val) {
              var swatch = document.createElement("button");
              swatch.type = "button";
              swatch.className = "qv-swatch" + (qvState.selected[optIdx] === val ? " active" : "");
              swatch.dataset.value = val;
              swatch.dataset.optionIndex = optIdx;
              swatch.style.background = val.toLowerCase();
              swatch.title = val;
              swatch.setAttribute("aria-label", val);
              swatch.addEventListener("click", function () {
                handleQVClick(swatch, optIdx);
              });
              swatches.appendChild(swatch);
            });
            wrap.appendChild(swatches);
          } else {
            var pills = document.createElement("div");
            pills.className = "qv-pills";
            optValues.forEach(function (val) {
              var pill = document.createElement("button");
              pill.type = "button";
              pill.className = "qv-pill" + (qvState.selected[optIdx] === val ? " active" : "");
              pill.dataset.value = val;
              pill.dataset.optionIndex = optIdx;
              pill.textContent = val;
              pill.addEventListener("click", function () {
                handleQVClick(pill, optIdx);
              });
              pills.appendChild(pill);
            });
            wrap.appendChild(pills);
          }
        })(i, values, isColor);

        qvVariantsEl.appendChild(wrap);
      }

      refreshQVSoldOut();
    }

    function openQV(card) {
      var info = card.querySelector(".lux-info");
      if (!info) return;

      var variants = card._luxVariants || [];
      var selected = card._luxSelected ? card._luxSelected.slice() : [];
      var images = [];
      try {
        images = JSON.parse(info.dataset.images || "[]");
      } catch {}

      var optionNames = [];
      try {
        var rawNames = (info.dataset.optionNames || "").trim();
        if (rawNames) {
          optionNames = rawNames.split("|").map(function (name) {
            return name.trim();
          });
        }
      } catch {}

      qvState = {
        variants: variants,
        selected: selected,
        images: normalizeImages(images),
        optionNames: optionNames,
        currentImgIdx: 0,
      };

      if (qvTitleEl) qvTitleEl.textContent = info.dataset.productTitle || "";
      if (qvLinkEl) qvLinkEl.href = info.dataset.productUrl || "#";

      if (qvThumbsEl) qvThumbsEl.innerHTML = "";
      if (qvMainImg) qvMainImg.src = "";
      if (qvImgCounter) qvImgCounter.innerHTML = "";
      if (qvImgPrev) {
        qvImgPrev.style.display = "";
        qvImgPrev.disabled = true;
      }
      if (qvImgNext) {
        qvImgNext.style.display = "";
        qvImgNext.disabled = true;
      }

      if (qvState.images.length) {
        qvState.images.forEach(function (img, i) {
          if (qvThumbsEl) {
            var thumb = document.createElement("div");
            thumb.className = "qv-thumb" + (i === 0 ? " active" : "");
            var thumbImg = document.createElement("img");
            thumbImg.src = img.src || getImgSrc(img, "medium") || getImgSrc(img, "large");
            thumbImg.alt = img.alt || "";
            thumbImg.loading = "lazy";
            thumb.appendChild(thumbImg);
            thumb.addEventListener("click", function () {
              showQVImage(i);
            });
            qvThumbsEl.appendChild(thumb);
          }

          if (qvImgCounter) {
            var dot = document.createElement("button");
            dot.type = "button";
            dot.className = "qv-img-dot" + (i === 0 ? " active" : "");
            dot.setAttribute("aria-label", "Image " + (i + 1));
            dot.addEventListener("click", function () {
              showQVImage(i);
            });
            qvImgCounter.appendChild(dot);
          }
        });

        showQVImage(0);
      } else {
        var cardImg = card.querySelector(".lux-img");
        if (qvMainImg && cardImg && cardImg.src) {
          qvMainImg.src = cardImg.src;
          qvMainImg.alt = cardImg.alt || "";
        }
        if (qvImgPrev) qvImgPrev.style.display = "none";
        if (qvImgNext) qvImgNext.style.display = "none";
      }

      renderQVVariants();
      updateQVPrice();

      if (qvQty) qvQty.value = 1;
      if (qvAtcText) qvAtcText.textContent = "Add to Cart";
      if (qvAtcBtn) {
        qvAtcBtn.classList.remove("loading", "success");
        qvAtcBtn.style.background = "";
      }

      backdrop.classList.add("open");
      modal.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    if (qvQty) {
      modal.querySelectorAll(".qv-qty-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var action = btn.dataset.action;
          var value = parseInt(qvQty.value, 10) || 1;
          if (action === "plus") qvQty.value = value + 1;
          if (action === "minus" && value > 1) qvQty.value = value - 1;
        });
      });
    }

    if (qvAtcBtn) {
      qvAtcBtn.addEventListener("click", function () {
        var variant = matchQVVariant();
        if (!variant) return;

        if (!variant.available) {
          if (qvAtcText) qvAtcText.textContent = "Sold Out";
          return;
        }

        qvAtcBtn.classList.add("loading");
        if (qvAtcText) qvAtcText.textContent = "Adding...";

        fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: variant.id, quantity: parseInt(qvQty.value, 10) || 1 }),
        })
          .then(function (res) {
            if (res.ok) {
              qvAtcBtn.classList.remove("loading");
              qvAtcBtn.classList.add("success");
              qvAtcBtn.style.background = "#2d6a4f";
              if (qvAtcText) qvAtcText.textContent = "Added";
              setTimeout(function () {
                closeQV();
                document.dispatchEvent(new CustomEvent("cart:open"));
                var cartIcon = document.querySelector(
                  '[href="/cart"], .cart-icon, #cart-icon, .js-cart-trigger, [data-cart-toggle], .header__icon--cart',
                );
                if (cartIcon) cartIcon.click();
              }, 800);
            } else {
              qvAtcBtn.classList.remove("loading");
              if (qvAtcText) qvAtcText.textContent = "Try Again";
            }
          })
          .catch(function () {
            qvAtcBtn.classList.remove("loading");
            if (qvAtcText) qvAtcText.textContent = "Error";
          });
      });
    }

    cards.forEach(function (card) {
      var trigger = card.querySelector(".lux-qv-trigger");
      if (trigger) {
        trigger.addEventListener("click", function () {
          openQV(card);
        });
      }
    });

    if (closeBtn) closeBtn.addEventListener("click", closeQV);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeQV();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeQV();
    });
  }

  document.querySelectorAll("[data-lux-root]").forEach(function (root) {
    initLuxRoot(root);
  });
})();
