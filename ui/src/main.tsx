import React from "react";
import { createRoot } from "react-dom/client";
import { Velaris } from "../components/ui/velaris";
import "./index.css";

function CampusKitVelaris() {
  return <section className="velaris-section" aria-label="CampusKit introduction">
    <Velaris className="velaris-panel" height="300px" speed={0.45} grain={0.12}>
      <div className="velaris-copy">
        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-100">CampusKit • Student workspace</span>
        <h2>Everything you need to<br className="hidden sm:block" /> move forward.</h2>
        <p>Study smarter, organise your work, and keep your campus life moving — all in one place.</p>
      </div>
    </Velaris>
  </section>;
}

const mount = document.getElementById("campuskit-velaris-root");
if (mount) createRoot(mount).render(<CampusKitVelaris />);
