(() => {
    'use strict';

    const maxBytes = 20 * 1024 * 1024;
    const maxPixels = 45_000_000;
    const previewEdge = 4096;
    const sizes = Object.freeze({
        avatar: { width: 320, height: 320, limit: 48000 },
        cover: { width: 1080, height: 360, limit: 145000 }
    });
    const readError = 'Не удалось открыть изображение. Попробуйте другой файл JPEG или PNG.';

    function jpegDimensions(bytes, view) {
        for (let offset = 2; offset + 7 < bytes.length;) {
            if (bytes[offset++] !== 0xff) break;
            while (bytes[offset] === 0xff) offset++;
            const marker = bytes[offset++];
            if (marker === 0xd9 || marker === 0xda || offset + 7 >= bytes.length) break;
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
            }
            const length = view.getUint16(offset);
            if (length < 2) break;
            offset += length;
        }
        return [];
    }

    function webpDimensions(bytes, view, kind) {
        if (kind === 'VP8X' && bytes.length >= 30) {
            const read24 = offset => 1 + bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
            return [read24(24), read24(27)];
        }
        if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
            const packed = view.getUint32(21, true);
            return [1 + (packed & 0x3fff), 1 + ((packed >>> 14) & 0x3fff)];
        }
        if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) {
            return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
        }
        return [];
    }

    function recognize(bytes) {
        const ascii = (offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
            return { type: 'image/jpeg', dimensions: jpegDimensions(bytes, view) };
        }
        if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 4) === 'IHDR') {
            return { type: 'image/png', dimensions: [view.getUint32(16), view.getUint32(20)] };
        }
        if (bytes.length >= 20 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
            return { type: 'image/webp', dimensions: webpDimensions(bytes, view, ascii(12, 4)) };
        }
        if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) {
            return { type: 'image/gif', dimensions: [view.getUint16(6, true), view.getUint16(8, true)] };
        }
        if (bytes.length >= 26 && ascii(0, 2) === 'BM') {
            const dimensions = view.getUint32(14, true) === 12
                ? [view.getUint16(18, true), view.getUint16(20, true)]
                : [view.getInt32(18, true), Math.abs(view.getInt32(22, true))];
            return { type: 'image/bmp', dimensions };
        }
        if (bytes.length >= 16 && ascii(4, 4) === 'ftyp') {
            const brands = [ascii(8, 4)];
            const end = Math.min(view.getUint32(0), bytes.length, 512);
            for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(offset, 4));
            if (brands.some(brand => brand === 'avif' || brand === 'avis')) return { type: 'image/avif', dimensions: [] };
            if (brands.some(brand => /^(?:heic|heix|hevc|hevx|heis|heim|hevm|hevs|mif1|msf1)$/.test(brand))) {
                return { type: 'image/heic', dimensions: [] };
            }
        }
        return null;
    }

    function checkDimensions(width, height) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
            throw new Error(readError);
        }
        if (width * height > maxPixels || Math.max(width, height) > 16384) {
            throw new Error('Изображение слишком большое. Уменьшите его до 45 мегапикселей.');
        }
    }

    async function decodeImage(blob) {
        if (typeof createImageBitmap === 'function') {
            // Modern decoders apply EXIF orientation to both the pixels and their dimensions.
            const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => null);
            if (bitmap) return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
        }
        const url = URL.createObjectURL(blob);
        const image = new Image();
        try {
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = url;
            });
        } catch (_) {
            throw new Error(readError);
        } finally {
            URL.revokeObjectURL(url);
            image.onload = image.onerror = null;
        }
        return {
            source: image, width: image.naturalWidth, height: image.naturalHeight,
            release: () => image.removeAttribute('src')
        };
    }

    async function load(file) {
        if (!file || typeof file.slice !== 'function' || !file.size) throw new Error('Выберите файл изображения.');
        if (file.size > maxBytes) throw new Error('Выберите изображение до 20 МБ.');
        const header = await file.slice(0, 256 * 1024).arrayBuffer().catch(() => { throw new Error(readError); });
        const format = recognize(new Uint8Array(header));
        if (!format) throw new Error('Подойдут изображения JPEG, PNG, WebP, AVIF, HEIC, GIF и BMP.');
        if (format.dimensions.length) checkDimensions(...format.dimensions);
        const decoded = await decodeImage(file.slice(0, file.size, format.type));
        try {
            const { source, width, height } = decoded;
            checkDimensions(width, height);
            const scale = Math.min(1, previewEdge / Math.max(width, height));
            if (scale === 1 && typeof source.naturalWidth !== 'number') return decoded;
            // Freeze the fallback Image at one frame and keep very large photographs off the crop surface.
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error(readError);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
            decoded.release();
            return { source: canvas, width: canvas.width, height: canvas.height, release: () => { canvas.width = 0; canvas.height = 0; } };
        } catch (error) {
            decoded.release();
            throw error instanceof Error && error.name === 'Error' ? error : new Error(readError);
        }
    }

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function frame(width, height, aspect, zoom = 1, offsetX = .5, offsetY = .5) {
        if (![width, height, aspect].every(value => Number.isFinite(value) && value > 0)) throw new Error(readError);
        const factor = Number.isFinite(zoom) ? clamp(zoom, 1, 6) : 1;
        const cropWidth = Math.min(width, height * aspect) / factor;
        const cropHeight = cropWidth / aspect;
        const position = value => Number.isFinite(value) ? clamp(value, 0, 1) : .5;
        return {
            x: Math.max(0, width - cropWidth) * position(offsetX),
            y: Math.max(0, height - cropHeight) * position(offsetY),
            width: cropWidth,
            height: cropHeight
        };
    }

    function paint(ctx, source, crop, width, height) {
        const sourceWidth = source.naturalWidth || source.width;
        const sourceHeight = source.naturalHeight || source.height;
        const rotation = crop.rotation ?? 0;
        ctx.save();
        try {
            ctx.fillStyle = '#e6e3e9';
            ctx.fillRect(0, 0, width, height);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.scale(width / crop.width, height / crop.height);
            ctx.translate(-crop.x, -crop.y);
            if (rotation === 90) ctx.transform(0, 1, -1, 0, sourceHeight, 0);
            else if (rotation === 180) ctx.transform(-1, 0, 0, -1, sourceWidth, sourceHeight);
            else if (rotation === 270) ctx.transform(0, -1, 1, 0, 0, sourceWidth);
            ctx.drawImage(source, 0, 0);
        } finally {
            ctx.restore();
        }
    }

    const toJpeg = (canvas, quality) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    const base64 = blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const encodeError = 'Не удалось подготовить изображение. Попробуйте другой файл.';

    async function encodeImage(source, crop, { width, height, limit, scales = [1, .8, .6] }) {
        const canvas = document.createElement('canvas');
        try {
            for (const scale of scales) {
                canvas.width = Math.max(1, Math.round(width * scale));
                canvas.height = Math.max(1, Math.round(height * scale));
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) break;
                paint(ctx, source, crop, canvas.width, canvas.height);
                for (const quality of [.9, .8, .69, .57, .45]) {
                    const blob = await toJpeg(canvas, quality);
                    if (!blob || blob.type !== 'image/jpeg') throw new Error(encodeError);
                    if (4 * Math.ceil(blob.size / 3) <= limit) return await base64(blob);
                }
            }
        } catch (_) {
            throw new Error(encodeError);
        }
        throw new Error(encodeError);
    }

    async function encode(source, crop, kind) {
        if (!source || !crop || !Object.hasOwn(sizes, kind) ||
            ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
            crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 ||
            ![0, 90, 180, 270].includes(crop.rotation ?? 0)) throw new Error(encodeError);
        return encodeImage(source, crop, sizes[kind]);
    }

    async function encodeBackground(file) {
        const image = await load(file);
        const scale = Math.min(1, 1728 / Math.max(image.width, image.height));
        try {
            return await encodeImage(image.source, { x: 0, y: 0, width: image.width, height: image.height }, {
                width: image.width * scale,
                height: image.height * scale,
                limit: 192000,
                scales: [1, .8, .6, .48, .36]
            });
        } finally {
            image.release();
        }
    }

    window.AlmanionProfileImage = Object.freeze({ load, frame, paint, encode, encodeBackground });
})();
