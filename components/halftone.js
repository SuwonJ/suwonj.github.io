export class HalftoneBackground {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    this.gap = options.gap || 35;
    this.effectRadius = options.effectRadius || 450;
    this.iconSrc =
      options.iconSrc !== undefined
        ? options.iconSrc
        : "./assets/suwonjiconwhite.svg";

    this.boundarySelectors = options.boundarySelectors || [".navbar", "hr"];
    this.buttonSelectors = options.buttonSelectors || [];
    this.iconScale = options.iconScale !== undefined ? options.iconScale : 0.7;

    this.currentBoundaryYs = [];
    this.targetBoundaryYs = [];
    this.currentButtonRects = [];
    this.targetButtonRects = [];

    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.iconRect = { x: 0, y: 0, w: 400, h: 400 };
    this.iconData = null;
    this.iconImg = new Image();
    this.isScrolling = false;
  }

  init() {
    this.setupEvents();
    if (this.iconSrc) {
      this.iconImg.onload = () => {
        this.cacheIconData();
        this.resizeCanvas();
        // 모바일 브라우저(특히 Safari)의 SVG 래스터화 지연 문제 해결을 위해 지연 재호출
        setTimeout(() => {
          this.cacheIconData();
        }, 100);
      };
      this.iconImg.src = this.iconSrc;
    }
    this.resizeCanvas();
    this.scanTargets();
    this.animate();
  }

  scanTargets() {
    const scrollY = window.scrollY;

    this.targetBoundaryYs = [];

    // 모든 selector를 동일하게 처리 — 매칭되는 요소 전부 boundary로 등록
    this.boundarySelectors.forEach((selector) => {
      const elements = Array.from(document.querySelectorAll(selector));
      if (elements.length === 0) return;

      elements.forEach((el) => {
        const isFixed = window.getComputedStyle(el).position === "fixed";
        const rect = el.getBoundingClientRect();
        this.targetBoundaryYs.push({
          position: isFixed ? rect.bottom : rect.bottom + scrollY,
          left: rect.left,
          right: rect.right,
          isFixed: isFixed,
        });
      });
    });

    this.targetButtonRects = [];
    this.buttonSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        const isFixed = window.getComputedStyle(el).position === "fixed";
        const rect = el.getBoundingClientRect();
        this.targetButtonRects.push({
          el: el,
          left: rect.left,
          right: rect.right,
          top: isFixed ? rect.top : rect.top + scrollY,
          bottom: isFixed ? rect.bottom : rect.bottom + scrollY,
          isFixed: isFixed,
          pulseValue: 0,
        });
      });
    });

    if (this.currentBoundaryYs.length !== this.targetBoundaryYs.length) {
      this.currentBoundaryYs = JSON.parse(
        JSON.stringify(this.targetBoundaryYs),
      );
    }
    if (this.currentButtonRects.length !== this.targetButtonRects.length) {
      this.currentButtonRects = JSON.parse(
        JSON.stringify(this.targetButtonRects),
      );
      for (let i = 0; i < this.currentButtonRects.length; i++) {
        this.currentButtonRects[i].el = this.targetButtonRects[i].el;
        this.currentButtonRects[i].pulseValue = 0;
      }
    } else {
      for (let i = 0; i < this.currentButtonRects.length; i++) {
        this.currentButtonRects[i].el = this.targetButtonRects[i].el;
      }
    }
  }

  pulseButton(element) {
    for (let i = 0; i < this.currentButtonRects.length; i++) {
      if (this.currentButtonRects[i].el === element) {
        this.currentButtonRects[i].pulseValue = 1.0;
        break;
      }
    }
  }

  // 런타임에 아이콘 교체 (연락처 호버 등)
  setIcon(src) {
    if (!src) {
      this.iconData = null;
      this.iconSrc = null;
      return;
    }
    if (src === this.iconSrc) return;
    this.iconSrc = src;
    const img = new Image();
    img.onload = () => {
      if (this.iconSrc !== src) return; // 로딩 중 src가 바뀐 경우 무시
      this.iconImg = img;
      this.cacheIconData();
    };
    img.src = src;
  }

  cacheIconData() {
    if (!this.iconImg.complete) return;
    const imgWidth = this.iconImg.naturalWidth || 234;
    const imgHeight = this.iconImg.naturalHeight || 200;

    const offCanvas = document.createElement("canvas");
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
    this.iconRect.w = Math.floor(
      Math.min(window.innerWidth * this.iconScale, 900),
    );
    this.iconRect.h = Math.floor((imgHeight / imgWidth) * this.iconRect.w);
    const margin = 40;
    this.iconRect.x = Math.floor(window.innerWidth - this.iconRect.w - margin);
    this.iconRect.y = Math.floor(window.innerHeight - this.iconRect.h - margin);
    offCanvas.width = this.iconRect.w;
    offCanvas.height = this.iconRect.h;
    offCtx.drawImage(this.iconImg, 0, 0, this.iconRect.w, this.iconRect.h);
    this.iconData = offCtx.getImageData(
      0,
      0,
      this.iconRect.w,
      this.iconRect.h,
    ).data;
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + "px";
    this.canvas.style.height = window.innerHeight + "px";
    this.ctx.scale(dpr, dpr);
    if (this.iconSrc) this.cacheIconData();
  }

  setupEvents() {
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.scanTargets();
    });

    const updateMouse = (x, y) => {
      this.mouse.x = x;
      this.mouse.y = y;
    };

    window.addEventListener("mousemove", (e) =>
      updateMouse(e.clientX, e.clientY),
    );

    window.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length > 0)
          updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );

    window.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 0)
          updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true },
    );

    window.addEventListener("touchend", () => updateMouse(-1000, -1000));
    window.addEventListener("mouseleave", () => updateMouse(-1000, -1000));

    let scrollTimeout;
    window.addEventListener(
      "scroll",
      () => {
        this.isScrolling = true;
        this.scanTargets();
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.isScrolling = false;
        }, 150);
      },
      { passive: true },
    );
  }

  animate() {
    const scrollY = window.scrollY;

    for (let i = 0; i < this.currentBoundaryYs.length; i++) {
      let targetPos = this.targetBoundaryYs[i].position;

      // 스크롤이 멈췄을 때 완벽히 한 줄(100%)에 안착하도록 격자(Grid) 위치에 자석처럼 스냅
      if (!this.isScrolling) {
        if (this.targetBoundaryYs[i].isFixed) {
          const absPos = targetPos + scrollY;
          const snappedAbs = Math.round(absPos / this.gap) * this.gap;
          targetPos = snappedAbs - scrollY;
        } else {
          targetPos = Math.round(targetPos / this.gap) * this.gap;
        }
      }

      this.currentBoundaryYs[i].position +=
        (targetPos - this.currentBoundaryYs[i].position) * 0.15;
      this.currentBoundaryYs[i].left +=
        (this.targetBoundaryYs[i].left - this.currentBoundaryYs[i].left) * 0.15;
      this.currentBoundaryYs[i].right +=
        (this.targetBoundaryYs[i].right - this.currentBoundaryYs[i].right) *
        0.15;
    }

    for (let i = 0; i < this.currentButtonRects.length; i++) {
      let tTop = this.targetButtonRects[i].top;
      let tBottom = this.targetButtonRects[i].bottom;
      let tLeft = this.targetButtonRects[i].left;
      let tRight = this.targetButtonRects[i].right;

      // 스크롤 멈춤 시 격자에 스냅 (UI 애매한 위치로 인한 2줄 흐림 현상 방지)
      if (!this.isScrolling) {
        if (this.targetButtonRects[i].isFixed) {
          const absTop = tTop + scrollY;
          const absBottom = tBottom + scrollY;
          tTop = Math.round(absTop / this.gap) * this.gap - scrollY;
          tBottom = Math.round(absBottom / this.gap) * this.gap - scrollY;
        } else {
          tTop = Math.round(tTop / this.gap) * this.gap;
          tBottom = Math.round(tBottom / this.gap) * this.gap;
        }
        // X 좌표의 경우 점들이 gap/2 부터 시작하므로 해당 오프셋에 맞게 스냅
        tLeft =
          Math.round((tLeft - this.gap / 2) / this.gap) * this.gap +
          this.gap / 2;
        tRight =
          Math.round((tRight - this.gap / 2) / this.gap) * this.gap +
          this.gap / 2;
      }

      this.currentButtonRects[i].top +=
        (tTop - this.currentButtonRects[i].top) * 0.15;
      this.currentButtonRects[i].bottom +=
        (tBottom - this.currentButtonRects[i].bottom) * 0.15;
      this.currentButtonRects[i].left +=
        (tLeft - this.currentButtonRects[i].left) * 0.15;
      this.currentButtonRects[i].right +=
        (tRight - this.currentButtonRects[i].right) * 0.15;

      if (this.currentButtonRects[i].pulseValue > 0) {
        this.currentButtonRects[i].pulseValue *= 0.9;
      }
    }

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // 코드블럭 배경 그리기 (스냅된 좌표에 맞게)
    this.ctx.fillStyle = "#00000040";
    for (let rect of this.currentButtonRects) {
      const screenTop = rect.isFixed ? rect.top : rect.top - scrollY;
      const screenBottom = rect.isFixed ? rect.bottom : rect.bottom - scrollY;
      const width = rect.right - rect.left;
      const height = screenBottom - screenTop;

      if (width > 0 && height > 0) {
        this.ctx.beginPath();
        if (this.ctx.roundRect) {
          this.ctx.roundRect(rect.left, screenTop, width, height, 4);
        } else {
          this.ctx.rect(rect.left, screenTop, width, height);
        }
        this.ctx.fill();
      }
    }

    const time = performance.now() * 0.002;
    const yOffset = ((-scrollY % this.gap) + this.gap) % this.gap;

    for (let x = this.gap / 2; x < window.innerWidth; x += this.gap) {
      for (let y = yOffset; y < window.innerHeight; y += this.gap) {
        const absY = y + scrollY;
        const dx = this.mouse.x - x;
        const dy = this.mouse.y - y;
        const mouseDist = Math.sqrt(dx * dx + dy * dy);

        const wave1 = Math.sin(x * 0.003 + time * 0.4);
        const wave2 = Math.cos(absY * 0.004 - time * 0.3);
        const wave3 = Math.sin((x + absY) * 0.002 + time * 0.5);
        const organicWave = (wave1 + wave2 + wave3) / 3;

        let radius = 1 + Math.abs(organicWave) * 1.4;
        let opacity = 0.05 + Math.abs(organicWave) * 0.2;

        let hoverRatio = 0;
        if (mouseDist < this.effectRadius) {
          hoverRatio = 1 - mouseDist / this.effectRadius;
          radius = Math.max(radius, 1 + 2 * hoverRatio);
          opacity = Math.max(opacity, 0.05 + 0.05 * hoverRatio);
        }

        if (
          this.iconData &&
          x >= this.iconRect.x &&
          x < this.iconRect.x + this.iconRect.w &&
          y >= this.iconRect.y &&
          y < this.iconRect.y + this.iconRect.h
        ) {
          const lx = Math.floor(x - this.iconRect.x);
          const ly = Math.floor(y - this.iconRect.y);
          const pixelIdx = (ly * this.iconRect.w + lx) * 4;
          const alpha = this.iconData[pixelIdx + 3];

          if (alpha > 20) {
            const r = this.iconData[pixelIdx];
            const g = this.iconData[pixelIdx + 1];
            const b = this.iconData[pixelIdx + 2];
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            const intensity = luminance * (alpha / 255);

            const baseRadius =
              0.2 + 1 * intensity + Math.abs(organicWave) * 0.8;
            const baseOpacity =
              0.05 + 0.3 * intensity + Math.abs(organicWave) * 0.05;

            let imgRadiusBonus = baseRadius;
            let imgOpacityBonus = baseOpacity;

            if (hoverRatio > 0) {
              imgRadiusBonus += 1.5 * intensity * hoverRatio;
              imgOpacityBonus += 0.2 * intensity * hoverRatio;
            }

            radius = Math.max(radius, imgRadiusBonus);
            opacity = Math.max(opacity, imgOpacityBonus);
          }
        }

        let maxBoundaryIntensity = 0;
        for (let b of this.currentBoundaryYs) {
          const checkY = b.isFixed ? y : absY;
          const dist = Math.abs(checkY - b.position);

          if (dist < this.gap && x >= b.left && x <= b.right) {
            const normalizedDist = dist / this.gap;
            // 코사인 파형을 적용하여 두 줄이 굵게 나오는 현상을 줄이고 샤프하게 만듦
            const intensity = Math.pow(
              Math.cos((normalizedDist * Math.PI) / 2),
              2.5,
            );
            maxBoundaryIntensity = Math.max(maxBoundaryIntensity, intensity);
          }
        }

        let maxButtonEdgeIntensity = 0;
        let activeEdgePulse = 0;

        for (let rect of this.currentButtonRects) {
          const checkY = rect.isFixed ? y : absY;

          // 4면에 hr과 동일한 빛나는 선(Edge)을 그리기 위한 계산 (안쪽 채우기 없음)
          const distTop = Math.abs(checkY - rect.top);
          const distBottom = Math.abs(checkY - rect.bottom);
          const distLeft = Math.abs(x - rect.left);
          const distRight = Math.abs(x - rect.right);

          // 교차로(Corner)에서 선이 튀어나가는 현상 방지: 정확히 모서리까지만 렌더링되도록 -1, +1 오차만 허용
          const xInBounds = x >= rect.left - 1 && x <= rect.right + 1;
          const yInBounds = checkY >= rect.top - 1 && checkY <= rect.bottom + 1;

          let edgeDist = Infinity;
          if (xInBounds) {
            edgeDist = Math.min(edgeDist, distTop, distBottom);
          }
          if (yInBounds) {
            edgeDist = Math.min(edgeDist, distLeft, distRight);
          }

          if (edgeDist < this.gap) {
            const normalizedDist = edgeDist / this.gap;
            // 밝기를 높이기 위해 지수를 2.5에서 1.8로 낮춰 약간 더 두껍고 밝게 만듦
            const intensity = Math.pow(
              Math.cos((normalizedDist * Math.PI) / 2),
              1.8,
            );
            if (intensity > maxButtonEdgeIntensity) {
              maxButtonEdgeIntensity = intensity;
              activeEdgePulse = rect.pulseValue || 0;
            }
          }
        }

        const finalBoundaryIntensity = Math.max(
          maxBoundaryIntensity,
          maxButtonEdgeIntensity,
        );

        if (finalBoundaryIntensity > 0) {
          const intensity = finalBoundaryIntensity;

          const lineFlow = Math.sin(x * 0.015 - time * 0.5);

          let boundaryRadius = (3.0 + Math.max(0, lineFlow * 1.1)) * intensity;
          let boundaryOpacity = (0.4 + Math.max(0, lineFlow * 0.1)) * intensity;

          if (hoverRatio > 0) {
            boundaryRadius += 5 * hoverRatio * intensity;
            boundaryOpacity += 0.5 * hoverRatio * intensity;
          }

          // 클릭 시 테두리(Edge) 선들이 크게 빛나며 펄스 반응!
          if (activeEdgePulse > 0.01) {
            boundaryRadius += 10 * activeEdgePulse * maxButtonEdgeIntensity;
            boundaryOpacity += 0.4 * activeEdgePulse * maxButtonEdgeIntensity;
          }

          radius = Math.max(radius, boundaryRadius);
          opacity = Math.max(opacity, boundaryOpacity);
        }
        const isLight = document.documentElement.classList.contains('light-mode') || document.body.classList.contains('light-mode');
        const dotColor = isLight ? '0, 0, 0' : '255, 255, 255';

        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${dotColor}, ${opacity})`;
        this.ctx.fill();
      }
    }
    requestAnimationFrame(this.animate.bind(this));
  }
}
