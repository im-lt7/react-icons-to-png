"use client";

import React, { useEffect, useRef, useState } from "react";

export default function IconDownloader() {
    const [from, setFrom] = useState("");
    const [iconName, setIconName] = useState("");
    const [importLine, setImportLine] = useState("");
    const [IconComp, setIconComp] = useState<React.ComponentType<any> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [size, setSize] = useState<number>(1080);

    // NEW: warna icon
    const [color, setColor] = useState("#000000"); // default hitam
    // --------------------------------------------

    const previewRef = useRef<HTMLDivElement | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    function parseAndApplyImport(line: string) {
        if (!line || !line.trim()) {
            setError("Paste an import line like: import { BiAddToQueue } from 'react-icons/bi';");
            return false;
        }

        const cleaned = line.trim();
        const named = cleaned.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*["']([^"']+)["']/i);

        if (named) {
            const names = named[1].split(",").map((s) => s.trim()).filter(Boolean);
            if (names.length) {
                const first = names[0].split(/\s+as\s+/i)[0].trim();
                const modulePath = named[2];
                const fromVal = /react-icons/i.test(modulePath) ? modulePath : `react-icons/${modulePath}`;
                setIconName(first);
                setFrom(fromVal);
                setError(null);
                return true;
            }
        }

        const def = cleaned.match(/import\s+([A-Za-z0-9_$]+)\s+from\s*["']([^"']+)["']/i);
        if (def && /react-icons|^fa|^ai|^md|^ri|^hi|^bi|^bs|^cg|^gi/i.test(def[2])) {
            const modulePath = def[2];
            const fromVal = /react-icons/i.test(modulePath) ? modulePath : `react-icons/${modulePath}`;
            setIconName(def[1]);
            setFrom(fromVal);
            setError(null);
            return true;
        }

        setError("Couldn't parse import. Example: import { BiAddToQueue } from 'react-icons/bi';");
        return false;
    }

    // ============================================================
    // LOAD LOCAL STORAGE
    // ============================================================
    useEffect(() => {
        try {
            const saved = localStorage.getItem("iconDownloader.importLine");
            const savedFrom = localStorage.getItem("iconDownloader.from");
            const savedIcon = localStorage.getItem("iconDownloader.iconName");
            const savedColor = localStorage.getItem("iconDownloader.color"); // NEW

            if (saved) setImportLine(saved);
            if (savedFrom) setFrom(savedFrom);
            if (savedIcon) setIconName(savedIcon);
            if (savedColor) setColor(savedColor); // NEW
        } catch (e) { }
    }, []);

    // Auto-parse import
    useEffect(() => {
        if (!importLine || !/react-icons/i.test(importLine)) return;
        const id = setTimeout(() => parseAndApplyImport(importLine), 450);
        return () => clearTimeout(id);
    }, [importLine]);

    // SAVE local storage
    useEffect(() => {
        const id = setTimeout(() => {
            try {
                if (importLine) localStorage.setItem("iconDownloader.importLine", importLine);
                if (from) localStorage.setItem("iconDownloader.from", from);
                if (iconName) localStorage.setItem("iconDownloader.iconName", iconName);
                localStorage.setItem("iconDownloader.color", color); // NEW
            } catch (e) { }
        }, 300);
        return () => clearTimeout(id);
    }, [importLine, from, iconName, color]);

    // ============================================================
    // LOAD ICON DYNAMIC IMPORT
    // ============================================================
    useEffect(() => {
        let cancelled = false;

        async function loadIcon() {
            setError(null);
            setIconComp(null);

            if (!from || !iconName) return;

            let mod: any = null;

            const prefixes: Record<string, () => Promise<any>> = {
                ai: () => import("react-icons/ai"),
                bi: () => import("react-icons/bi"),
                bs: () => import("react-icons/bs"),
                fi: () => import("react-icons/fi"),
                fa: () => import("react-icons/fa"),
                fa6: () => import("react-icons/fa6"),
                md: () => import("react-icons/md"),
                hi: () => import("react-icons/hi"),
                hi2: () => import("react-icons/hi2"),
                ri: () => import("react-icons/ri"),
                io: () => import("react-icons/io"),
                io5: () => import("react-icons/io5"),
                cg: () => import("react-icons/cg"),
                di: () => import("react-icons/di"),
                gi: () => import("react-icons/gi"),
                go: () => import("react-icons/go"),
                gr: () => import("react-icons/gr"),
                im: () => import("react-icons/im"),
                lu: () => import("react-icons/lu"),
                si: () => import("react-icons/si"),
                sl: () => import("react-icons/sl"),
                tb: () => import("react-icons/tb"),
                ti: () => import("react-icons/ti"),
                wi: () => import("react-icons/wi"),
            };

            let key = from.toLowerCase().replace("react-icons/", "");
            if (prefixes[key]) {
                try {
                    mod = await prefixes[key]();
                } catch (e) { }
            }

            if (!mod) {
                try {
                    mod = await import("react-icons");
                } catch (e) { }
            }

            if (!mod) {
                setError("Failed to load icon package.");
                return;
            }

            const Comp = mod[iconName];
            if (!Comp) return setError(`Icon '${iconName}' not found.`);

            if (!cancelled) setIconComp(() => Comp);
        }

        loadIcon();
        return () => {
            cancelled = true;
        };
    }, [from, iconName]);

    // ============================================================
    // DOWNLOAD PNG — now applying COLOR
    // ============================================================
    async function downloadPng() {
        return new Promise<void>((resolve, reject) => {
            setError(null);
            if (!previewRef.current) return reject("No preview.");

            const svg = previewRef.current.querySelector("svg");
            if (!svg) return reject("No SVG.");

            const clone = svg.cloneNode(true) as SVGSVGElement;
            clone.setAttribute("width", String(size));
            clone.setAttribute("height", String(size));

            // NEW: Paksa path fill sesuai color
            clone.querySelectorAll("*").forEach((el) => {
                (el as HTMLElement).setAttribute("fill", color);
            });

            let serialized = new XMLSerializer().serializeToString(clone);

            // Jika belum ada xmlns, tambahkan
            if (!serialized.includes("xmlns=")) {
                serialized = serialized.replace(
                    "<svg",
                    '<svg xmlns="http://www.w3.org/2000/svg"'
                );
            }

            const s = serialized;

            const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                if (!ctx) return reject("Canvas error");
                ctx.drawImage(img, 0, 0, size, size);

                canvas.toBlob((blob) => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob!);
                    a.download = `${iconName}.png`;
                    a.click();
                    resolve();
                });
            };
            img.onerror = reject;
            img.src = svgData;
        });
    }

    async function handleDownloadClick() {
        setIsDownloading(true);
        setError(null);

        try {
            await downloadPng();
        } finally {
            setIsDownloading(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-50 p-6 dark:bg-black text-black dark:text-zinc-50">
            <main className="mx-auto max-w-3xl">
                <h1 className="mb-4 text-2xl font-semibold">React Icons → PNG Downloader</h1>

                <div className="grid gap-3 sm:grid-cols-12 items-end mb-4">
                    <div className="sm:col-span-12">
                        <label className="text-xs">Paste import</label>
                        <input
                            value={importLine}
                            onChange={(e) => setImportLine(e.target.value)}
                            className="w-full border px-3 py-2 rounded"
                        />
                    </div>

                    <div className="sm:col-span-3">
                        <label className="text-xs">from (prefix)</label>
                        <input value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border px-3 py-2 rounded" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="text-xs">ikon (export)</label>
                        <input value={iconName} onChange={(e) => setIconName(e.target.value)} className="w-full border px-3 py-2 rounded" />
                    </div>

                    <div className="sm:col-span-2">
                        <label className="text-xs">size</label>
                        <input type="number" value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full border px-3 py-2 rounded" />
                    </div>

                    {/* NEW COLOR PICKER */}
                    <div className="sm:col-span-1">
                        <label className="text-xs">color</label>
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="w-full h-10 p-1 rounded cursor-pointer"
                        />
                    </div>
                    {/* -------------------------------------- */}
                </div>

                <button
                    onClick={handleDownloadClick}
                    disabled={!IconComp || isDownloading}
                    className="px-5 py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
                >
                    {isDownloading ? "Downloading..." : "Download PNG"}
                </button>

                <div className="flex gap-6 mt-6">
                    <div className="border p-4 rounded" ref={previewRef}>
                        {IconComp ? <IconComp size={160} color={color} /> : "Preview"}
                    </div>
                </div>
            </main>
        </div>
    );
}
