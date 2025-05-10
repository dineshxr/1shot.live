// Minimal confetti effect for Preact (no dependency)
// Usage: <Confetti show={show} />

import { useEffect, useRef } from "https://unpkg.com/preact@10.13.1/hooks/dist/hooks.module.js";

export function Confetti({ show }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    const particles = Array.from({ length: 120 }, () => createParticle(canvas));

    function createParticle(canvas) {
      const colors = ["#FFD700", "#FF69B4", "#00CFFF", "#ADFF2F", "#FF6347", "#8A2BE2"];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        r: Math.random() * 6 + 4,
        d: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.random() * 10 - 10,
        tiltAngle: 0,
        tiltAngleIncremental: (Math.random() * 0.07) + 0.05
      };
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p, i) => {
        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 3, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5);
        ctx.stroke();
      });
      update();
      animationFrameId = requestAnimationFrame(draw);
    }

    function update() {
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(0.01 * p.d);
        p.tiltAngle += p.tiltAngleIncremental;
        p.tilt = Math.sin(p.tiltAngle) * 15;
        // Respawn
        if (p.y > canvas.height) {
          particles[i] = createParticle(canvas);
          particles[i].y = 0;
        }
      }
    }

    draw();
    return () => {
      cancelAnimationFrame(animationFrameId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [show]);

  // Responsive size
  useEffect(() => {
    function resize() {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return show
    ? html`<canvas ref=${canvasRef} style="position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9999;pointer-events:none;"></canvas>`
    : null;
}
