// @ts-nocheck

import {
  h,
  render,
} from "https://unpkg.com/preact@10.13.1/dist/preact.module.js";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
} from "https://unpkg.com/preact@10.13.1/hooks/dist/hooks.module.js";
import htm from "https://unpkg.com/htm@3.1.1/dist/htm.module.js";

// Import our root App component
import { App } from "./components/app.js";

// Make these available globally for our components
window.h = h;
window.useState = useState;
window.useEffect = useEffect;
window.useRef = useRef;
window.useMemo = useMemo;
window.html = htm.bind(h);

window.PUBLIC_ENV = {
  supabaseUrl: "https://lbayphzxmdtdmrqmeomt.supabase.co",
  supabaseKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo",
  turnstileSiteKey: "0x4AAAAAAA_Rl5VDA4u6EMKm",
};

// Render the App component
render(html`<${App} />`, document.getElementById("app-root"));
