"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { duotoneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

const baseCodeStyle = {
    background: "transparent",
    borderRadius: 0,
    border: "none",
    fontSize: "0.85rem",
    lineHeight: "1.45",
    padding: "1rem",
    margin: 0,
};

import { useEffect, useState } from "react";

export default function JsonHighlighter({ data }: { data: any }) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return (
            <div style={baseCodeStyle} className="text-[var(--muted)] text-xs p-4">
                Loading JSON...
            </div>
        );
    }

    return (
        <SyntaxHighlighter
            language="json"
            style={duotoneDark}
            customStyle={baseCodeStyle}
            showLineNumbers={false}
        >
            {JSON.stringify(data, null, 2)}
        </SyntaxHighlighter>
    );
}
