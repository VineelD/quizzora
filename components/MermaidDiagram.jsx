"use client";

import { useEffect, useId, useState } from "react";

let mermaidInitialized = false;

export default function MermaidDiagram({ source, className = "" }) {
  const reactId = useId().replace(/:/g, "");
  const [status, setStatus] = useState("loading");
  const [svgMarkup, setSvgMarkup] = useState("");

  useEffect(() => {
    let cancelled = false;
    const text = String(source || "").trim();

    if (!text) {
      setStatus("error");
      setSvgMarkup("");
      return undefined;
    }

    setStatus("loading");
    setSvgMarkup("");

    async function renderDiagram() {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "strict",
            fontFamily: "inherit",
          });
          mermaidInitialized = true;
        }

        const uniqueId = `study-mermaid-${reactId}-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueId, text);

        if (!cancelled) {
          setSvgMarkup(svg);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setSvgMarkup("");
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [reactId, source]);

  if (status === "loading") {
    return (
      <div aria-busy="true" className={`study-diagram-loading ${className}`.trim()}>
        Drawing diagram…
      </div>
    );
  }

  if (status === "error") {
    return (
      <pre className={`study-mermaid-fallback ${className}`.trim()}>{String(source || "").trim()}</pre>
    );
  }

  return (
    <div
      aria-hidden={false}
      className={`study-mermaid-diagram ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
      role="img"
    />
  );
}
