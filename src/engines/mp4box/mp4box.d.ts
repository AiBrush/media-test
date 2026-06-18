/**
 * src/engines/mp4box/mp4box.d.ts — intentionally NO ambient module.
 *
 * mp4box was upgraded 0.5.4 -> 2.3.0. The modern (1.x/2.x) TypeScript rewrite SHIPS its own
 * declarations (`package.json` `"types": "./dist/mp4box.all.d.ts"`), so the adapter imports the real
 * typed surface directly:
 *
 *   import { createFile, DataStream, Endianness, MP4BoxBuffer } from 'mp4box';
 *   import type { ISOFile, Movie, Track, Sample } from 'mp4box';
 *
 * A local `declare module 'mp4box' { ... }` here would SHADOW (and fight) those shipped types, so the
 * 0.5.4-era ambient declaration that used to live in this file has been removed. This file is kept
 * only as documentation of that decision; it declares nothing.
 *
 * Researched 2026-06-17 against mp4box@2.3.0 — see adapter.ts header for cited doc URLs.
 */

export {};
