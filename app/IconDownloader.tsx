"use client";

import React, { useEffect, useRef, useState } from "react";

export default function IconDownloader() {
    const [from, setFrom] = useState("");
    const [iconName, setIconName] = useState("");
    const [importLine, setImportLine] = useState("");
    const [IconComp, setIconComp] = useState<React.ComponentType<any> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [size, setSize] = useState<number>(1080);
    const previewRef = useRef<HTMLDivElement | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    function parseAndApplyImport(line: string) {
        if (!line || !line.trim()) {
            setError("Paste an import line like: import { BiAddToQueue } from 'react-icons/bi';");
            return false;
        }

        const cleaned = line.trim();

        // try named import anywhere: import { Icon, Other } from 'react-icons/...'
        const named = cleaned.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*["']([^"']+)["']/i);
        if (named) {
            const names = named[1].split(",").map((s) => s.trim()).filter(Boolean);
            if (names.length) {
                const first = names[0].split(/\s+as\s+/i)[0].trim();
                const modulePath = named[2];
                // If user provided just the suffix (e.g. 'fa' or 'fa6'), normalize to full package path.
                const fromVal = /react-icons/i.test(modulePath) ? modulePath : `react-icons/${modulePath}`;
                setIconName(first);
                setFrom(fromVal);
                setError(null);
                return true;
            }
        }

        // try default import: import Icon from 'react-icons/...'
        const def = cleaned.match(/import\s+([A-Za-z0-9_$]+)\s+from\s+["']([^"']+)["']/i);
        if (def && /react-icons|^fa|^ai|^md|^ri|^hi|^bi|^bs|^cg|^gi/i.test(def[2])) {
            const modulePath = def[2];
            const fromVal = /react-icons/i.test(modulePath) ? modulePath : `react-icons/${modulePath}`;
            setIconName(def[1]);
            setFrom(fromVal);
            setError(null);
            return true;
        }

        // try import * as X from 'react-icons/xx' (can't infer icon)
        const star = cleaned.match(/import\s*\*\s*as\s*([A-Za-z0-9_$]+)\s*from\s*["']([^"']+)["']/i);
        if (star && /react-icons/i.test(star[2])) {
            setError(
                "Found namespace import. Use a named import (e.g. import { BiAddToQueue } from 'react-icons/bi') so I can pick a single icon."
            );
            return false;
        }

        // try require with destructuring: const { Icon } = require('react-icons/xx')
        const reqNamed = cleaned.match(/require\(\s*["']([^"']+)["']\s*\)\s*\}/i);
        if (reqNamed && /react-icons/i.test(reqNamed[1])) {
            // try to extract names from left side
            const left = cleaned.split("=")[0];
            const namesMatch = left.match(/\{\s*([^}]+)\s*\}/);
            if (namesMatch) {
                const names = namesMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
                if (names.length) {
                    const modulePath = reqNamed[1];
                    const fromVal = /react-icons/i.test(modulePath) ? modulePath : `react-icons/${modulePath}`;
                    setIconName(names[0].split(/\s+as\s+/i)[0].trim());
                    setFrom(fromVal);
                    setError(null);
                    return true;
                }
            }
        }

        // try simple require default: const Icons = require('react-icons/bi')
        const reqDefault = cleaned.match(/require\(\s*["']([^"']+)["']\s*\)/i);
        if (reqDefault && /react-icons/i.test(reqDefault[1])) {
            setError(
                "Found require(...) import. Use a named import (e.g. import { BiAddToQueue } from 'react-icons/bi') so I can pick a single icon."
            );
            return false;
        }

        setError("Couldn't parse import. Accepted examples:\nimport { BiAddToQueue } from 'react-icons/bi';\nimport BiAddToQueue from 'react-icons/bi';");
        return false;
    }

    // load last importLine from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem("iconDownloader.importLine");
            if (saved) setImportLine(saved);
            const savedFrom = localStorage.getItem("iconDownloader.from");
            const savedIcon = localStorage.getItem("iconDownloader.iconName");
            if (savedFrom) setFrom(savedFrom);
            if (savedIcon) setIconName(savedIcon);
        } catch (e) {
            // ignore
        }
    }, []);

    // Auto-apply parser when user pastes or enters an import-like line.
    useEffect(() => {
        if (!importLine || !/react-icons/i.test(importLine)) return;
        const id = setTimeout(() => {
            parseAndApplyImport(importLine);
        }, 450);
        return () => clearTimeout(id);
    }, [importLine]);

    // persist importLine to localStorage (debounced)
    useEffect(() => {
        const id = setTimeout(() => {
            try {
                if (importLine) localStorage.setItem("iconDownloader.importLine", importLine);
            } catch (e) {
                // ignore
            }
        }, 300);
        return () => clearTimeout(id);
    }, [importLine]);

    // persist from & iconName to localStorage (debounced)
    useEffect(() => {
        const id = setTimeout(() => {
            try {
                if (from) localStorage.setItem("iconDownloader.from", from);
                if (iconName) localStorage.setItem("iconDownloader.iconName", iconName);
            } catch (e) {
                // ignore
            }
        }, 300);
        return () => clearTimeout(id);
    }, [from, iconName]);

    useEffect(() => {
        let cancelled = false;
        async function loadIcon() {
            setError(null);
            setIconComp(null);
            if (!from || !iconName) return;

            const raw = (from || "").trim();

            // Derive imports from the user's `from` input. We no longer keep a
            // hard-coded static importer map — instead try the exact path the user
            // provided (e.g. "react-icons/di"), then try `react-icons/<key>` where
            // <key> is the last path segment the user entered, and finally fall back
            // to importing the root "react-icons" package.

            let mod: any = null;
            const tried: string[] = [];
            const errors: string[] = [];

            // Re-introduce a small static importer map so common prefixes are
            // included by the bundler. If you need more prefixes added, we can
            // extend this list; dynamic variable imports alone may not include
            // subpackages in the final bundle.
            const importers: Record<string, () => Promise<any>> = {
                ai: () => import("react-icons/ai"),   // Ant Design
                bi: () => import("react-icons/bi"),   // BoxIcons
                bs: () => import("react-icons/bs"),   // Bootstrap
                cg: () => import("react-icons/cg"),   // css.gg
                ci: () => import("react-icons/ci"),   // Circum
                di: () => import("react-icons/di"),   // Devicons
                fa: () => import("react-icons/fa"),   // Font Awesome 5
                fa6: () => import("react-icons/fa6"), // Font Awesome 6
                fc: () => import("react-icons/fc"),   // Flat Color Icons
                fi: () => import("react-icons/fi"),   // Feather
                gi: () => import("react-icons/gi"),   // Game Icons
                go: () => import("react-icons/go"),   // GitHub Octicons
                gr: () => import("react-icons/gr"),   // Grommet
                hi: () => import("react-icons/hi"),   // Heroicons v1
                hi2: () => import("react-icons/hi2"), // Heroicons v2
                im: () => import("react-icons/im"),   // IcoMoon Free
                io: () => import("react-icons/io"),   // Ionicons v4
                io5: () => import("react-icons/io5"), // Ionicons v5
                lia: () => import("react-icons/lia"), // Line Awesome
                lu: () => import("react-icons/lu"),   // Lucide
                md: () => import("react-icons/md"),   // Material Design
                ri: () => import("react-icons/ri"),   // Remix Icon
                rx: () => import("react-icons/rx"),   // Radix Icons
                si: () => import("react-icons/si"),   // Simple Icons (brand)
                sl: () => import("react-icons/sl"),   // Simple Line Icons
                tb: () => import("react-icons/tb"),   // Tabler
                tfi: () => import("react-icons/tfi"), // Themify
                ti: () => import("react-icons/ti"),   // Typicons
                vsc: () => import("react-icons/vsc"), // VS Code Icons
                wi: () => import("react-icons/wi"),   // Weather Icons
            };

            // Derive the last segment (key) from the user's `from` input and try to
            // import `react-icons/<key>`. Note: importing a fully dynamic path like
            // import(raw) can't be resolved by Next/webpack, so we avoid that and use
            // the predictable `react-icons/<key>` form which our bundler can pick up
            // (or the static importers above which force inclusion).
            let key = raw.toLowerCase();
            if (key.includes("react-icons/")) key = key.split("react-icons/").pop() || key;
            if (key.includes("/")) key = key.split("/").pop() || key;
            key = key.replace(/[^a-z0-9_\-]/gi, "").toLowerCase();

            if (key) {
                // Try static importer first (helps bundlers include the module)
                const staticImporter = importers[key];
                if (staticImporter) {
                    try {
                        tried.push(`react-icons/${key} (static)`);
                        mod = await staticImporter();
                    } catch (e: any) {
                        mod = null;
                        errors.push(String(e && e.message ? e.message : e));
                    }
                }

                // Then try a dynamic import for the same path. This is still limited
                // (bundlers may not include arbitrary dynamic imports), but it's a
                // reasonable fallback for common subpackages.
                if (!mod) {
                    try {
                        tried.push(`react-icons/${key}`);
                        // @ts-ignore dynamic import
                        mod = await import(`react-icons/${key}`);
                    } catch (e: any) {
                        mod = null;
                        errors.push(String(e && e.message ? e.message : e));
                    }
                }
            }

            // 4) As a last attempt, try importing the root package and hope the icon is reachable there
            if (!mod) {
                try {
                    mod = await import("react-icons");
                } catch (e) {
                    mod = null;
                }
            }

            if (!mod) {
                setError(`Could not load icons for '${from}'. Tried the provided path, react-icons/${raw} and the react-icons root.`);
                return;
            }

            try {
                const Comp = (mod as any)[iconName] || (mod.default && (mod.default as any)[iconName]);
                if (!Comp) return setError(`Icon '${iconName}' not found in '${from}'.`);
                if (!cancelled) setIconComp(() => Comp);
            } catch (e: any) {
                setError(`Failed to load icon '${iconName}' from '${from}'. Make sure react-icons is installed.`);
            }
        }
        loadIcon();
        return () => {
            cancelled = true;
        };
    }, [from, iconName]);

    async function downloadPng() {
        return new Promise<void>((resolve, reject) => {
            setError(null);
            if (!previewRef.current) {
                setError("No preview element found.");
                reject(new Error("No preview element"));
                return;
            }
            const svg = previewRef.current.querySelector("svg");
            if (!svg) {
                setError("No SVG found to download.");
                reject(new Error("No SVG found"));
                return;
            }
            const clone = svg.cloneNode(true) as SVGSVGElement;
            clone.setAttribute("width", String(size));
            clone.setAttribute("height", String(size));
            clone.setAttribute("viewBox", svg.getAttribute("viewBox") || `0 0 ${size} ${size}`);
            const s = new XMLSerializer().serializeToString(clone);
            const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.includes("xmlns=") ? s : s.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'));
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    setError("Failed to get canvas context.");
                    reject(new Error("Canvas context failed"));
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        setError("Failed to create PNG.");
                        reject(new Error("Blob creation failed"));
                        return;
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${iconName}.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    resolve();
                }, "image/png");
            };
            img.onerror = () => {
                setError("Failed to load SVG as image.");
                reject(new Error("Image load failed"));
            };
            img.src = svgData;
        });
    }

    async function handleDownloadClick() {
        setIsDownloading(true);
        setError(null);
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        try {
            // Ensure we have both from and iconName before attempting download
            if (!from || !iconName) {
                setError("Please provide both 'from' (prefix) and 'ikon' (export name).");
                setIsDownloading(false);
                return;
            }

            // Wait a bit to let the icon load via the useEffect
            const start = Date.now();
            let attempts = 0;
            while ((!IconComp || IconComp === null) && Date.now() - start < 3000 && attempts < 30) {
                // eslint-disable-next-line no-await-in-loop
                await sleep(100);
                attempts++;
            }

            if (!IconComp) {
                setError("Icon failed to load. Check the prefix and icon name are correct.");
                setIsDownloading(false);
                return;
            }

            await downloadPng();
        } finally {
            setIsDownloading(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-50 p-6 dark:bg-black text-black dark:text-zinc-50">
            <main className="mx-auto max-w-3xl">
                <h1 className="mb-4 text-2xl font-semibold">React Icons → PNG Downloader</h1>

                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">Paste import line or fill fields below.</p>

                <div className="mb-4 grid gap-3 sm:gap-4 sm:grid-cols-12 items-end">
                    <div className="sm:col-span-12">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">Paste import</label>
                        <div className="mt-1 flex gap-2">
                            <input
                                value={importLine}
                                onChange={(e) => setImportLine(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && parseAndApplyImport(importLine)}
                                onPaste={(e) => {
                                    const text = e.clipboardData?.getData("text") || "";
                                    // set the pasted text and immediately attempt to parse it (auto-apply)
                                    setImportLine(text);
                                    parseAndApplyImport(text);
                                }}
                                className="flex-1 rounded border px-3 py-2"
                                placeholder={'import { BiAddToQueue } from "react-icons/bi";'}
                            />
                        </div>
                    </div>

                    <div className="sm:col-span-3">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">from (prefix)</label>
                        <input value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded border px-3 py-2 w-full" />
                    </div>

                    <div className="sm:col-span-6">
                        <label className="text-xs text-zinc-600 dark:text-zinc-400">ikon (export)</label>
                        <input value={iconName} onChange={(e) => setIconName(e.target.value)} className="mt-1 rounded border px-3 py-2 w-full" />
                    </div>

                    <div className="sm:col-span-2 flex items-end gap-2">
                        <div className="w-full">
                            <label className="text-xs text-zinc-600 dark:text-zinc-400">size (px)</label>
                            <input type="number" value={size} onChange={(e) => setSize(Math.max(8, Number(e.target.value) || 1080))} className="mt-1 rounded border px-3 py-2 w-full" />
                        </div>
                    </div>

                    {/* button removed from grid; rendered in dedicated row below */}
                </div>

                        {error && <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

                        {/* Dedicated button row placed BEFORE the preview to avoid overlap */}
                        <div className="mb-4 flex items-center justify-center">
                            <div className="w-full max-w-3xl flex justify-center">
                                <button onClick={handleDownloadClick} disabled={isDownloading || !IconComp} className={`rounded px-5 py-3 text-white font-medium ${IconComp && !isDownloading ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400'}`}>{isDownloading ? 'Downloading...' : 'Download PNG'}</button>
                            </div>
                        </div>

                        <div className="flex gap-6 flex-col sm:flex-row mt-2">
                                <div className="rounded border p-4 relative z-10">
                                    <div className="flex h-28 w-28 sm:h-48 sm:w-48 items-center justify-center relative overflow-hidden" ref={previewRef}>
                                        {IconComp ? <IconComp size={Math.min(160, size)} /> : <div className="text-sm text-zinc-500">Preview</div>}
                                    </div>
                                </div>

                    <div className="flex-1">
                        <h2 className="mb-2 text-lg font-medium">Preview</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Jika ikon gagal dimuat, periksa prefix dan nama export (case-sensitive).</p>
                    </div>
                </div>
                    </main>

                    {/* Floating download button (always on top) */}
                    <div className="fixed bottom-6 right-6 z-[9999]">
                        <button
                            onClick={handleDownloadClick}
                            disabled={isDownloading || !IconComp}
                            title={IconComp ? 'Download PNG' : 'Icon not ready'}
                            aria-label="Download PNG"
                            className={`rounded-full w-14 h-14 flex items-center justify-center text-white text-lg shadow-lg ${IconComp && !isDownloading ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                        >
                            {isDownloading ? '...' : '↓'}
                        </button>
                    </div>

                </div>
    );
}
