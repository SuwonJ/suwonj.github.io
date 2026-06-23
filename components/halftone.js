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

    this.currentBoundaryYs = [];
    this.targetBoundaryYs = [];
    this.currentButtonRects = [];
    this.targetButtonRects = [];

    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.iconRect = { x: 0, y: 0, w: 400, h: 400 };
    this.iconData = null;
    this.iconImg = new Image();
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
    this.boundarySelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
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
          left: rect.left,
          right: rect.right,
          top: isFixed ? rect.top : rect.top + scrollY,
          bottom: isFixed ? rect.bottom : rect.bottom + scrollY,
          isFixed: isFixed,
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
    }
  }

  cacheIconData() {
    if (!this.iconImg.complete) return;
    const imgWidth = this.iconImg.naturalWidth || 234;
    const imgHeight = this.iconImg.naturalHeight || 200;

    const offCanvas = document.createElement("canvas");
    const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });
    this.iconRect.w = Math.floor(Math.min(window.innerWidth * 0.7, 900));
    this.iconRect.h = Math.floor(
      (imgHeight / imgWidth) *
        this.iconRect.w,
    );
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

    window.addEventListener("mousemove", (e) => updateMouse(e.clientX, e.clientY));

    window.addEventListener("touchstart", (e) => {
      if (e.touches.length > 0) updateMouse(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (e.touches.length > 0) updateMouse(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener("touchend", () => updateMouse(-1000, -1000));
    window.addEventListener("mouseleave", () => updateMouse(-1000, -1000));

    window.addEventListener(
      "scroll",
      () => {
        this.scanTargets();
      },
      { passive: true },
    );
  }

  animate() {
    for (let i = 0; i < this.currentBoundaryYs.length; i++) {
      this.currentBoundaryYs[i].position +=
        (this.targetBoundaryYs[i].position -
          this.currentBoundaryYs[i].position) *
        0.15;
      this.currentBoundaryYs[i].left +=
        (this.targetBoundaryYs[i].left - this.currentBoundaryYs[i].left) * 0.15;
      this.currentBoundaryYs[i].right +=
        (this.targetBoundaryYs[i].right - this.currentBoundaryYs[i].right) *
        0.15;
    }

    for (let i = 0; i < this.currentButtonRects.length; i++) {
      this.currentButtonRects[i].top +=
        (this.targetButtonRects[i].top - this.currentButtonRects[i].top) * 0.15;
      this.currentButtonRects[i].bottom +=
        (this.targetButtonRects[i].bottom - this.currentButtonRects[i].bottom) *
        0.15;
      this.currentButtonRects[i].left +=
        (this.targetButtonRects[i].left - this.currentButtonRects[i].left) *
        0.15;
      this.currentButtonRects[i].right +=
        (this.targetButtonRects[i].right - this.currentButtonRects[i].right) *
        0.15;
    }

    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const time = performance.now() * 0.002;
    const scrollY = window.scrollY;
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
            // 거리가 멀어질 때 선형으로 어두워지지 않고(0.5), 제곱 곡선을 써서 중간 지점에서도 75%(0.75)의 밝기를 유지하게 함
            const intensity = 1 - (normalizedDist * normalizedDist);
            maxBoundaryIntensity = Math.max(maxBoundaryIntensity, intensity);
          }
        }

        let isButton = false;
        for (let rect of this.currentButtonRects) {
          const checkY = rect.isFixed ? y : absY;
          if (
            x >= rect.left &&
            x <= rect.right &&
            checkY >= rect.top &&
            checkY <= rect.bottom
          ) {
            isButton = true;
            break;
          }
        }

        if (maxBoundaryIntensity > 0 || isButton) {
          const intensity = Math.max(isButton ? 1 : 0, maxBoundaryIntensity);

          const lineFlow = Math.sin(x * 0.015 - time * 0.5);

          let boundaryRadius = (3.0 + Math.max(0, lineFlow * 1.1)) * intensity;
          let boundaryOpacity = (0.4 + Math.max(0, lineFlow * 0.1)) * intensity;

          if (hoverRatio > 0) {
            boundaryRadius += 5 * hoverRatio * intensity;
            boundaryOpacity += 0.5 * hoverRatio * intensity;
          }

          radius = Math.max(radius, boundaryRadius);
          opacity = Math.max(opacity, boundaryOpacity);
        }
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        this.ctx.fill();
      }
    }
    requestAnimationFrame(this.animate.bind(this));
  }
}
