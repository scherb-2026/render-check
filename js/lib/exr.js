/* ======================================================================
 * js/lib/exr.js — OpenEXR decoder (self-contained; also loads in Node for the tests)
 * ====================================================================== */

/* OpenEXR reader for the Distortion viewer.
 *
 * Reads scanline OpenEXR files (half / float / uint channels, any mix) compressed with NONE, RLE, ZIPS, ZIP, PXR24 or PIZ,
 * picks an RGB(A) or Y layer (also Blender multilayer files such as "ViewLayer.Combined.R") and converts it to an 8-bit
 * sRGB RGBA image ("Standard" view transform: linear -> sRGB, alpha unpremultiplied).
 * Not supported: tiled, deep and multipart files and the lossy B44, B44A, DWAA, DWAB codecs.
 *
 * The Huffman + wavelet code for PIZ (reverseLutFromBitmap … hufUncompress) is adapted from the three.js EXRLoader
 * (https://github.com/mrdoob/three.js, MIT licence, Copyright © 2010-2024 three.js authors), which in turn follows the
 * OpenEXR reference implementation (Copyright (c) 2002, Industrial Light & Magic, a division of Lucas Digital Ltd. LLC,
 * BSD-3-Clause) and TinyEXR (Copyright (c) 2014 - 2017, Syoyo Fujita, BSD-3-Clause).
 */
const EXR = (() => {
  const parseUint32 = (dv, off) => { const v = dv.getUint32(off.value, true); off.value += 4; return v; };
  const parseUint8Array = (u8, off) => u8[off.value++];

    const USHORT_RANGE = ( 1 << 16 );
    const BITMAP_SIZE = ( USHORT_RANGE >> 3 );

    const HUF_ENCBITS = 16; // literal (value) bit length
    const HUF_DECBITS = 14; // decoding bit size (>= 8)

    const HUF_ENCSIZE = ( 1 << HUF_ENCBITS ) + 1; // encoding table size
    const HUF_DECSIZE = 1 << HUF_DECBITS; // decoding table size
    const HUF_DECMASK = HUF_DECSIZE - 1;

    const NBITS = 16;
    const A_OFFSET = 1 << ( NBITS - 1 );
    const MOD_MASK = ( 1 << NBITS ) - 1;

    const SHORT_ZEROCODE_RUN = 59;
    const LONG_ZEROCODE_RUN = 63;
    const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

    const ULONG_SIZE = 8;
    const FLOAT32_SIZE = 4;
    const INT32_SIZE = 4;
    const INT16_SIZE = 2;
    const INT8_SIZE = 1;

    const STATIC_HUFFMAN = 0;
    const DEFLATE = 1;


    function reverseLutFromBitmap( bitmap, lut ) {

      let k = 0;

      for ( let i = 0; i < USHORT_RANGE; ++ i ) {

        if ( ( i == 0 ) || ( bitmap[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) ) {

          lut[ k ++ ] = i;

        }

      }

      const n = k - 1;

      while ( k < USHORT_RANGE ) lut[ k ++ ] = 0;

      return n;

    }

    function hufClearDecTable( hdec ) {

      for ( let i = 0; i < HUF_DECSIZE; i ++ ) {

        hdec[ i ] = {};
        hdec[ i ].len = 0;
        hdec[ i ].lit = 0;
        hdec[ i ].p = null;

      }

    }

    const getBitsReturn = { l: 0, c: 0, lc: 0 };

    function getBits( nBits, c, lc, uInt8Array, inOffset ) {

      while ( lc < nBits ) {

        c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
        lc += 8;

      }

      lc -= nBits;

      getBitsReturn.l = ( c >> lc ) & ( ( 1 << nBits ) - 1 );
      getBitsReturn.c = c;
      getBitsReturn.lc = lc;

    }

    const hufTableBuffer = new Array( 59 );

    function hufCanonicalCodeTable( hcode ) {

      for ( let i = 0; i <= 58; ++ i ) hufTableBuffer[ i ] = 0;
      for ( let i = 0; i < HUF_ENCSIZE; ++ i ) hufTableBuffer[ hcode[ i ] ] += 1;

      let c = 0;

      for ( let i = 58; i > 0; -- i ) {

        const nc = ( ( c + hufTableBuffer[ i ] ) >> 1 );
        hufTableBuffer[ i ] = c;
        c = nc;

      }

      for ( let i = 0; i < HUF_ENCSIZE; ++ i ) {

        const l = hcode[ i ];
        if ( l > 0 ) hcode[ i ] = l | ( hufTableBuffer[ l ] ++ << 6 );

      }

    }

    function hufUnpackEncTable( uInt8Array, inOffset, ni, im, iM, hcode ) {

      const p = inOffset;
      let c = 0;
      let lc = 0;

      for ( ; im <= iM; im ++ ) {

        if ( p.value - inOffset.value > ni ) return false;

        getBits( 6, c, lc, uInt8Array, p );

        const l = getBitsReturn.l;
        c = getBitsReturn.c;
        lc = getBitsReturn.lc;

        hcode[ im ] = l;

        if ( l == LONG_ZEROCODE_RUN ) {

          if ( p.value - inOffset.value > ni ) {

            throw new Error( 'Something wrong with hufUnpackEncTable' );

          }

          getBits( 8, c, lc, uInt8Array, p );

          let zerun = getBitsReturn.l + SHORTEST_LONG_RUN;
          c = getBitsReturn.c;
          lc = getBitsReturn.lc;

          if ( im + zerun > iM + 1 ) {

            throw new Error( 'Something wrong with hufUnpackEncTable' );

          }

          while ( zerun -- ) hcode[ im ++ ] = 0;

          im --;

        } else if ( l >= SHORT_ZEROCODE_RUN ) {

          let zerun = l - SHORT_ZEROCODE_RUN + 2;

          if ( im + zerun > iM + 1 ) {

            throw new Error( 'Something wrong with hufUnpackEncTable' );

          }

          while ( zerun -- ) hcode[ im ++ ] = 0;

          im --;

        }

      }

      hufCanonicalCodeTable( hcode );

    }

    function hufLength( code ) {

      return code & 63;

    }

    function hufCode( code ) {

      return code >> 6;

    }

    function hufBuildDecTable( hcode, im, iM, hdecod ) {

      for ( ; im <= iM; im ++ ) {

        const c = hufCode( hcode[ im ] );
        const l = hufLength( hcode[ im ] );

        if ( c >> l ) {

          throw new Error( 'Invalid table entry' );

        }

        if ( l > HUF_DECBITS ) {

          const pl = hdecod[ ( c >> ( l - HUF_DECBITS ) ) ];

          if ( pl.len ) {

            throw new Error( 'Invalid table entry' );

          }

          pl.lit ++;

          if ( pl.p ) {

            const p = pl.p;
            pl.p = new Array( pl.lit );

            for ( let i = 0; i < pl.lit - 1; ++ i ) {

              pl.p[ i ] = p[ i ];

            }

          } else {

            pl.p = new Array( 1 );

          }

          pl.p[ pl.lit - 1 ] = im;

        } else if ( l ) {

          let plOffset = 0;

          for ( let i = 1 << ( HUF_DECBITS - l ); i > 0; i -- ) {

            const pl = hdecod[ ( c << ( HUF_DECBITS - l ) ) + plOffset ];

            if ( pl.len || pl.p ) {

              throw new Error( 'Invalid table entry' );

            }

            pl.len = l;
            pl.lit = im;

            plOffset ++;

          }

        }

      }

      return true;

    }

    const getCharReturn = { c: 0, lc: 0 };

    function getChar( c, lc, uInt8Array, inOffset ) {

      c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
      lc += 8;

      getCharReturn.c = c;
      getCharReturn.lc = lc;

    }

    const getCodeReturn = { c: 0, lc: 0 };

    function getCode( po, rlc, c, lc, uInt8Array, inOffset, outBuffer, outBufferOffset, outBufferEndOffset ) {

      if ( po == rlc ) {

        if ( lc < 8 ) {

          getChar( c, lc, uInt8Array, inOffset );
          c = getCharReturn.c;
          lc = getCharReturn.lc;

        }

        lc -= 8;

        let cs = ( c >> lc );
        cs = new Uint8Array( [ cs ] )[ 0 ];

        if ( outBufferOffset.value + cs > outBufferEndOffset ) {

          return false;

        }

        const s = outBuffer[ outBufferOffset.value - 1 ];

        while ( cs -- > 0 ) {

          outBuffer[ outBufferOffset.value ++ ] = s;

        }

      } else if ( outBufferOffset.value < outBufferEndOffset ) {

        outBuffer[ outBufferOffset.value ++ ] = po;

      } else {

        return false;

      }

      getCodeReturn.c = c;
      getCodeReturn.lc = lc;

    }

    function UInt16( value ) {

      return ( value & 0xFFFF );

    }

    function Int16( value ) {

      const ref = UInt16( value );
      return ( ref > 0x7FFF ) ? ref - 0x10000 : ref;

    }

    const wdec14Return = { a: 0, b: 0 };

    function wdec14( l, h ) {

      const ls = Int16( l );
      const hs = Int16( h );

      const hi = hs;
      const ai = ls + ( hi & 1 ) + ( hi >> 1 );

      const as = ai;
      const bs = ai - hi;

      wdec14Return.a = as;
      wdec14Return.b = bs;

    }

    function wdec16( l, h ) {

      const m = UInt16( l );
      const d = UInt16( h );

      const bb = ( m - ( d >> 1 ) ) & MOD_MASK;
      const aa = ( d + bb - A_OFFSET ) & MOD_MASK;

      wdec14Return.a = aa;
      wdec14Return.b = bb;

    }

    function wav2Decode( buffer, j, nx, ox, ny, oy, mx ) {

      const w14 = mx < ( 1 << 14 );
      const n = ( nx > ny ) ? ny : nx;
      let p = 1;
      let p2;
      let py;

      while ( p <= n ) p <<= 1;

      p >>= 1;
      p2 = p;
      p >>= 1;

      while ( p >= 1 ) {

        py = 0;
        const ey = py + oy * ( ny - p2 );
        const oy1 = oy * p;
        const oy2 = oy * p2;
        const ox1 = ox * p;
        const ox2 = ox * p2;
        let i00, i01, i10, i11;

        for ( ; py <= ey; py += oy2 ) {

          let px = py;
          const ex = py + ox * ( nx - p2 );

          for ( ; px <= ex; px += ox2 ) {

            const p01 = px + ox1;
            const p10 = px + oy1;
            const p11 = p10 + ox1;

            if ( w14 ) {

              wdec14( buffer[ px + j ], buffer[ p10 + j ] );

              i00 = wdec14Return.a;
              i10 = wdec14Return.b;

              wdec14( buffer[ p01 + j ], buffer[ p11 + j ] );

              i01 = wdec14Return.a;
              i11 = wdec14Return.b;

              wdec14( i00, i01 );

              buffer[ px + j ] = wdec14Return.a;
              buffer[ p01 + j ] = wdec14Return.b;

              wdec14( i10, i11 );

              buffer[ p10 + j ] = wdec14Return.a;
              buffer[ p11 + j ] = wdec14Return.b;

            } else {

              wdec16( buffer[ px + j ], buffer[ p10 + j ] );

              i00 = wdec14Return.a;
              i10 = wdec14Return.b;

              wdec16( buffer[ p01 + j ], buffer[ p11 + j ] );

              i01 = wdec14Return.a;
              i11 = wdec14Return.b;

              wdec16( i00, i01 );

              buffer[ px + j ] = wdec14Return.a;
              buffer[ p01 + j ] = wdec14Return.b;

              wdec16( i10, i11 );

              buffer[ p10 + j ] = wdec14Return.a;
              buffer[ p11 + j ] = wdec14Return.b;


            }

          }

          if ( nx & p ) {

            const p10 = px + oy1;

            if ( w14 )
              wdec14( buffer[ px + j ], buffer[ p10 + j ] );
            else
              wdec16( buffer[ px + j ], buffer[ p10 + j ] );

            i00 = wdec14Return.a;
            buffer[ p10 + j ] = wdec14Return.b;

            buffer[ px + j ] = i00;

          }

        }

        if ( ny & p ) {

          let px = py;
          const ex = py + ox * ( nx - p2 );

          for ( ; px <= ex; px += ox2 ) {

            const p01 = px + ox1;

            if ( w14 )
              wdec14( buffer[ px + j ], buffer[ p01 + j ] );
            else
              wdec16( buffer[ px + j ], buffer[ p01 + j ] );

            i00 = wdec14Return.a;
            buffer[ p01 + j ] = wdec14Return.b;

            buffer[ px + j ] = i00;

          }

        }

        p2 = p;
        p >>= 1;

      }

      return py;

    }

    function hufDecode( encodingTable, decodingTable, uInt8Array, inOffset, ni, rlc, no, outBuffer, outOffset ) {

      let c = 0;
      let lc = 0;
      const outBufferEndOffset = no;
      const inOffsetEnd = Math.trunc( inOffset.value + ( ni + 7 ) / 8 );

      while ( inOffset.value < inOffsetEnd ) {

        getChar( c, lc, uInt8Array, inOffset );

        c = getCharReturn.c;
        lc = getCharReturn.lc;

        while ( lc >= HUF_DECBITS ) {

          const index = ( c >> ( lc - HUF_DECBITS ) ) & HUF_DECMASK;
          const pl = decodingTable[ index ];

          if ( pl.len ) {

            lc -= pl.len;

            getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

            c = getCodeReturn.c;
            lc = getCodeReturn.lc;

          } else {

            if ( ! pl.p ) {

              throw new Error( 'hufDecode issues' );

            }

            let j;

            for ( j = 0; j < pl.lit; j ++ ) {

              const l = hufLength( encodingTable[ pl.p[ j ] ] );

              while ( lc < l && inOffset.value < inOffsetEnd ) {

                getChar( c, lc, uInt8Array, inOffset );

                c = getCharReturn.c;
                lc = getCharReturn.lc;

              }

              if ( lc >= l ) {

                if ( hufCode( encodingTable[ pl.p[ j ] ] ) == ( ( c >> ( lc - l ) ) & ( ( 1 << l ) - 1 ) ) ) {

                  lc -= l;

                  getCode( pl.p[ j ], rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

                  c = getCodeReturn.c;
                  lc = getCodeReturn.lc;

                  break;

                }

              }

            }

            if ( j == pl.lit ) {

              throw new Error( 'hufDecode issues' );

            }

          }

        }

      }

      const i = ( 8 - ni ) & 7;

      c >>= i;
      lc -= i;

      while ( lc > 0 ) {

        const pl = decodingTable[ ( c << ( HUF_DECBITS - lc ) ) & HUF_DECMASK ];

        if ( pl.len ) {

          lc -= pl.len;

          getCode( pl.lit, rlc, c, lc, uInt8Array, inOffset, outBuffer, outOffset, outBufferEndOffset );

          c = getCodeReturn.c;
          lc = getCodeReturn.lc;

        } else {

          throw new Error( 'hufDecode issues' );

        }

      }

      return true;

    }

    function hufUncompress( uInt8Array, inDataView, inOffset, nCompressed, outBuffer, nRaw ) {

      const outOffset = { value: 0 };
      const initialInOffset = inOffset.value;

      const im = parseUint32( inDataView, inOffset );
      const iM = parseUint32( inDataView, inOffset );

      inOffset.value += 4;

      const nBits = parseUint32( inDataView, inOffset );

      inOffset.value += 4;

      if ( im < 0 || im >= HUF_ENCSIZE || iM < 0 || iM >= HUF_ENCSIZE ) {

        throw new Error( 'Something wrong with HUF_ENCSIZE' );

      }

      const freq = new Array( HUF_ENCSIZE );
      const hdec = new Array( HUF_DECSIZE );

      hufClearDecTable( hdec );

      const ni = nCompressed - ( inOffset.value - initialInOffset );

      hufUnpackEncTable( uInt8Array, inOffset, ni, im, iM, freq );

      if ( nBits > 8 * ( nCompressed - ( inOffset.value - initialInOffset ) ) ) {

        throw new Error( 'Something wrong with hufUncompress' );

      }

      hufBuildDecTable( freq, im, iM, hdec );

      hufDecode( freq, hdec, uInt8Array, inOffset, nBits, iM, nRaw, outBuffer, outOffset );

    }


  function applyLut(lut, data, nData) { for (let i = 0; i < nData; ++i) data[i] = lut[data[i]]; }

  // ---------- zlib inflate (RFC 1950/1951), table driven ----------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function buildTable(lengths, n) {                   // entry = (symbol << 4) | codeLength, 0 = invalid
    let maxLen = 0; const count = new Uint16Array(16);
    for (let i = 0; i < n; i++) { const l = lengths[i]; count[l]++; if (l > maxLen) maxLen = l; }
    count[0] = 0;
    if (maxLen === 0) return { table: new Int32Array(2), bits: 1 };
    const next = new Uint16Array(16); let code = 0;
    for (let l = 1; l <= 15; l++) { code = (code + count[l - 1]) << 1; next[l] = code; }
    const size = 1 << maxLen, table = new Int32Array(size);
    for (let s = 0; s < n; s++) {
      const l = lengths[s]; if (!l) continue;
      let c = next[l]++, rev = 0;
      for (let b = 0; b < l; b++) { rev = (rev << 1) | (c & 1); c >>= 1; }
      for (let j = rev; j < size; j += 1 << l) table[j] = (s << 4) | l;
    }
    return { table, bits: maxLen };
  }
  let FIXED = null;
  function inflateZlib(src, start, end, outLen) {
    const out = new Uint8Array(outLen);
    let pos = start + 2, o = 0, bitbuf = 0, bitcnt = 0;     // skip the 2-byte zlib header
    const need = (n) => { while (bitcnt < n) { bitbuf |= (pos < end ? src[pos] : 0) << bitcnt; pos++; bitcnt += 8; } };
    const bits = (n) => { if (!n) return 0; need(n); const v = bitbuf & ((1 << n) - 1); bitbuf >>>= n; bitcnt -= n; return v; };
    const sym = (t) => {
      need(t.bits);
      const e = t.table[bitbuf & ((1 << t.bits) - 1)];
      if (!e) throw new Error('corrupt zlib data');
      const l = e & 15; bitbuf >>>= l; bitcnt -= l;
      return e >> 4;
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; pos -= bitcnt >> 3; bitcnt = 0;           // back to a byte boundary
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        if (o + len > outLen) throw new Error('zlib data longer than expected');
        out.set(src.subarray(pos, pos + len), o); o += len; pos += len;
        continue;
      }
      let lt, dt;
      if (type === 1) {
        if (!FIXED) {
          const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
          FIXED = { l: buildTable(l, 288), d: buildTable(new Uint8Array(30).fill(5), 30) };
        }
        lt = FIXED.l; dt = FIXED.d;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[CLORDER[i]] = bits(3);
        const ct = buildTable(cl, 19), lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const s = sym(ct);
          if (s < 16) lens[i++] = s;
          else {
            let rep, val = 0;
            if (s === 16) { if (!i) throw new Error('corrupt zlib data'); val = lens[i - 1]; rep = 3 + bits(2); }
            else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
            if (i + rep > hlit + hdist) throw new Error('corrupt zlib data');
            while (rep--) lens[i++] = val;
          }
        }
        lt = buildTable(lens.subarray(0, hlit), hlit); dt = buildTable(lens.subarray(hlit), hdist);
      } else throw new Error('corrupt zlib data');
      for (;;) {
        const s = sym(lt);
        if (s < 256) { if (o >= outLen) throw new Error('zlib data longer than expected'); out[o++] = s; }
        else if (s === 256) break;
        else {
          const li = s - 257; if (li > 28) throw new Error('corrupt zlib data');
          const len = LBASE[li] + bits(LEXT[li]);
          const di = sym(dt); if (di > 29) throw new Error('corrupt zlib data');
          const dist = DBASE[di] + bits(DEXT[di]);
          if (dist > o || o + len > outLen) throw new Error('corrupt zlib data');
          for (let k = 0; k < len; k++, o++) out[o] = out[o - dist];
        }
      }
    } while (!last);
    if (o !== outLen) throw new Error('zlib data shorter than expected');
    return out;
  }

  // ---------- block decoders: each returns the block as [line][channel][x] little-endian bytes ----------
  const predictorAndReorder = (raw) => {                // ZIP and RLE: undo the delta predictor, then interleave the two halves
    for (let t = 1; t < raw.length; t++) raw[t] = raw[t - 1] + raw[t] - 128;
    const out = new Uint8Array(raw.length);
    let t1 = 0, t2 = (raw.length + 1) >> 1, s = 0;
    const stop = raw.length - 1;
    for (;;) { if (s > stop) break; out[s++] = raw[t1++]; if (s > stop) break; out[s++] = raw[t2++]; }
    return out;
  };
  function unRle(src, start, size, outLen) {
    const out = new Uint8Array(outLen); let p = start, o = 0; const end = start + size;
    while (p < end) {
      const c = (src[p++] << 24) >> 24;
      if (c < 0) { const n = -c; if (o + n > outLen || p + n > end) throw new Error('corrupt RLE data'); out.set(src.subarray(p, p + n), o); p += n; o += n; }
      else { const n = c + 1; if (o + n > outLen) throw new Error('corrupt RLE data'); out.fill(src[p++], o, o + n); o += n; }
    }
    if (o !== outLen) throw new Error('corrupt RLE data');
    return out;
  }
  function unPxr24(src, start, size, columns, lines, chans, rawLen) {
    const raw = inflateZlib(src, start, start + size, 0 + rawPxrSize(columns, lines, chans));
    const out = new Uint8Array(rawLen), dv = new DataView(out.buffer);
    let rp = 0, wp = 0;
    for (let y = 0; y < lines; y++) {
      for (const ch of chans) {
        let pixel = 0;
        if (ch.type === 1) {
          let a = rp, b = rp + columns; rp = b + columns;
          for (let j = 0; j < columns; j++) { pixel = (pixel + ((raw[a++] << 8) | raw[b++])) & 0xffff; dv.setUint16(wp, pixel, true); wp += 2; }
        } else if (ch.type === 2) {
          let a = rp, b = rp + columns, c = b + columns; rp = c + columns;
          for (let j = 0; j < columns; j++) { pixel = (pixel + ((raw[a++] << 24) | (raw[b++] << 16) | (raw[c++] << 8))) >>> 0; dv.setUint32(wp, pixel, true); wp += 4; }
        } else {
          let a = rp, b = rp + columns, c = b + columns, d = c + columns; rp = d + columns;
          for (let j = 0; j < columns; j++) { pixel = (pixel + ((raw[a++] << 24) | (raw[b++] << 16) | (raw[c++] << 8) | raw[d++])) >>> 0; dv.setUint32(wp, pixel, true); wp += 4; }
        }
      }
    }
    return out;
  }
  // PXR24 stores a float as 3 bytes, a half as 2, a uint as 4
  const rawPxrSize = (columns, lines, chans) => chans.reduce((n, ch) => n + columns * lines * (ch.type === 1 ? 2 : ch.type === 2 ? 3 : 4), 0);

  function unPiz(src, view, start, columns, lines, chans) {
    const inOffset = { value: start };
    let total = 0;
    const cd = chans.map((ch) => { const o = { start: total, end: total, nx: columns, ny: lines, size: ch.size16 }; total += columns * lines * ch.size16; return o; });
    const outBuffer = new Uint16Array(total), bitmap = new Uint8Array(BITMAP_SIZE);
    const minNonZero = view.getUint16(inOffset.value, true); inOffset.value += 2;
    const maxNonZero = view.getUint16(inOffset.value, true); inOffset.value += 2;
    if (maxNonZero >= BITMAP_SIZE) throw new Error('corrupt PIZ data');
    if (minNonZero <= maxNonZero) for (let i = 0; i < maxNonZero - minNonZero + 1; i++) bitmap[i + minNonZero] = src[inOffset.value++];
    const lut = new Uint16Array(USHORT_RANGE);
    const maxValue = reverseLutFromBitmap(bitmap, lut);
    const length = parseUint32(view, inOffset);
    hufUncompress(src, view, inOffset, length, outBuffer, total);
    for (let i = 0; i < chans.length; ++i) {
      const c = cd[i];
      for (let j = 0; j < c.size; ++j) wav2Decode(outBuffer, c.start + j, c.nx, c.size, c.ny, c.nx * c.size, maxValue);
    }
    applyLut(lut, outBuffer, total);
    const out = new Uint8Array(total * 2); let o = 0;
    for (let y = 0; y < lines; y++) {
      for (let c = 0; c < chans.length; c++) {
        const d = cd[c], n = d.nx * d.size;
        out.set(new Uint8Array(outBuffer.buffer, d.end * 2, n * 2), o); o += n * 2; d.end += n;
      }
    }
    return out;
  }

  // ---------- header ----------
  const COMPRESSION = ['NONE', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'];
  const BLOCK_LINES = [1, 1, 1, 16, 32, 16, 32, 32, 32, 256];
  function readCString(u8, off) { let e = off.value; while (e < u8.length && u8[e] !== 0) e++; const s = new TextDecoder().decode(u8.subarray(off.value, e)); off.value = e + 1; return s; }
  function readOneHeader(u8, dv, off) {                 // attributes up to the empty name that ends one header
    const h = { channels: null, compression: 0, dataWindow: null, displayWindow: null, name: '', type: '', chunkCount: 0, tiled: false };
    for (;;) {
      const name = readCString(u8, off); if (!name) break;
      readCString(u8, off);                                // attribute type name
      const size = dv.getInt32(off.value, true); off.value += 4;
      const at = off.value;
      if (name === 'channels') {
        const o = { value: at }; h.channels = [];
        while (u8[o.value] !== 0) {
          const nm = readCString(u8, o), t = dv.getInt32(o.value, true), xs = dv.getInt32(o.value + 8, true), ys = dv.getInt32(o.value + 12, true); o.value += 16;
          h.channels.push({ name: nm, type: t, bytes: t === 1 ? 2 : 4, size16: t === 1 ? 1 : 2, xs, ys });
        }
      } else if (name === 'compression') h.compression = u8[at];
      else if (name === 'dataWindow' || name === 'displayWindow') h[name] = { xMin: dv.getInt32(at, true), yMin: dv.getInt32(at + 4, true), xMax: dv.getInt32(at + 8, true), yMax: dv.getInt32(at + 12, true) };
      else if (name === 'name' || name === 'type') h[name] = new TextDecoder().decode(u8.subarray(at, at + size));
      else if (name === 'chunkCount') h.chunkCount = dv.getInt32(at, true);
      else if (name === 'tiles') h.tiled = true;
      off.value = at + size;
    }
    if (!h.channels || !h.dataWindow) throw new Error('corrupt EXR header');
    if (!h.displayWindow) h.displayWindow = h.dataWindow;
    return h;
  }
  // Single-part files have one header; multipart files (Blender's multilayer EXR) a list of them, one per layer/pass.
  function readHeaders(buffer) {
    const u8 = new Uint8Array(buffer), dv = new DataView(buffer);
    if (u8.length < 16 || dv.getUint32(0, true) !== 20000630) throw new Error('not an OpenEXR file');
    const flags = dv.getUint32(4, true), multi = !!(flags & 0x1000);
    if (!multi && (flags & 0x800)) throw new Error('deep EXR files are not supported');
    if (!multi && (flags & 0x200)) throw new Error('tiled EXR files are not supported (save as scanline)');
    const off = { value: 8 }, parts = [];
    for (;;) {
      parts.push(readOneHeader(u8, dv, off));
      if (!multi) break;
      if (u8[off.value] === 0) { off.value++; break; }      // an empty header ends the list
    }
    let table = off.value;
    for (const p of parts) {
      p.usable = !p.tiled && (p.type === '' || p.type === 'scanlineimage');
      const lines = BLOCK_LINES[p.compression] || 1, n = p.dataWindow.yMax - p.dataWindow.yMin + 1;
      p.nBlocks = multi && p.chunkCount ? p.chunkCount : Math.ceil(n / lines);
      p.table = table; table += 8 * p.nBlocks;
    }
    return { parts, multi };
  }
  // Which channels become the picture: plain R,G,B(,A); else a layer with R,G,B, preferring Blender's "Combined"; else Y (grey).
  function pickChannels(chans) {
    const idx = new Map(chans.map((c, i) => [c.name, i]));
    const prefixes = [...new Set(chans.map((c) => { const k = c.name.lastIndexOf('.'); return k >= 0 ? c.name.slice(0, k + 1) : ''; }))];
    const rgb = prefixes.filter((p) => idx.has(p + 'R') && idx.has(p + 'G') && idx.has(p + 'B'));
    const grey = prefixes.filter((p) => idx.has(p + 'Y'));
    if (rgb.length) {
      const p = rgb.find((x) => x === '') ?? rgb.find((x) => /(^|\.)Combined\.$/i.test(x)) ?? rgb[0];
      return { prefix: p, r: idx.get(p + 'R'), g: idx.get(p + 'G'), b: idx.get(p + 'B'), a: idx.has(p + 'A') ? idx.get(p + 'A') : -1, layers: rgb.map((x) => x.replace(/\.$/, '')) };
    }
    if (grey.length) { const p = grey.find((x) => x === '') ?? grey[0]; return { prefix: p, r: idx.get(p + 'Y'), g: -1, b: -1, a: idx.has(p + 'A') ? idx.get(p + 'A') : -1, grey: true, layers: grey.map((x) => x.replace(/\.$/, '')) }; }
    throw new Error('no RGB or grey channels found (channels: ' + chans.slice(0, 8).map((c) => c.name).join(', ') + (chans.length > 8 ? ', …' : '') + ')');
  }

  // half -> float, and linear -> sRGB lookup tables
  let HALF = null, OETF = null;
  const OETF_N = 16384;
  function tables() {
    if (HALF) return;
    HALF = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) {
      const s = i & 0x8000 ? -1 : 1, e = (i >> 10) & 31, m = i & 1023;
      HALF[i] = e === 0 ? s * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024);
    }
    OETF = new Uint8Array(OETF_N + 1);
    for (let i = 0; i <= OETF_N; i++) { const v = i / OETF_N; OETF[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // Decodes an EXR. opts.linear = true returns the stored linear values as Float32 RGBA instead of 8-bit sRGB.
  async function decode(buffer, opts = {}) {
    tables();
    const u8 = new Uint8Array(buffer), dv = new DataView(buffer);
    const { parts, multi } = readHeaders(buffer);
    // choose the part (layer) to show: plain R,G,B first, then Blender's "Combined", then any RGB, then grey
    let h = null, sel = null, rank = 99; const layers = []; let firstErr = null;
    parts.forEach((p, pi) => {
      if (!p.usable) { firstErr = firstErr || new Error('tiled or deep EXR parts are not supported (save as scanline)'); return; }
      let sl; try { sl = pickChannels(p.channels); } catch (e) { firstErr = firstErr || e; return; }
      const label = sl.prefix.replace(/\.$/, '') || p.name || '';
      layers.push(...sl.layers.map((l) => l || p.name || ''));
      const r = (sl.grey ? 10 : 0) + (sl.prefix === '' && !p.name ? 0 : /(^|\.)Combined\.?$/i.test(sl.prefix || p.name) ? 1 : 2);
      if (r < rank) { rank = r; h = p; sel = sl; h.partIndex = pi; sel.label = label; }
    });
    if (!h) throw firstErr || new Error('no usable image part found');
    if (h.compression >= COMPRESSION.length || ['B44', 'B44A', 'DWAA', 'DWAB'].includes(COMPRESSION[h.compression]))
      throw new Error('EXR compression ' + (COMPRESSION[h.compression] || '#' + h.compression) + ' is not supported. Save the EXR with ZIP, ZIPS, PIZ, PXR24, RLE or no compression (in Blender: Codec → ZIP).');
    const comp = COMPRESSION[h.compression], blockLines = BLOCK_LINES[h.compression];
    const chans = h.channels;
    if (chans.some((c) => c.xs !== 1 || c.ys !== 1)) throw new Error('EXR files with subsampled channels are not supported');
    const dw = h.dataWindow, dsp = h.displayWindow, width = dw.xMax - dw.xMin + 1, height = dw.yMax - dw.yMin + 1;
    const W = dsp.xMax - dsp.xMin + 1, H = dsp.yMax - dsp.yMin + 1;
    if (W < 1 || H < 1 || W * H > 120e6) throw new Error('EXR image size ' + W + '×' + H + ' is not supported');
    const chanOff = []; let bytesPerLine = 0;
    for (const c of chans) { chanOff.push(bytesPerLine); bytesPerLine += width * c.bytes; }
    const nBlocks = h.nBlocks, table = h.table, hdrExtra = multi ? 4 : 0;           // multipart chunks start with a part number
    const out = opts.linear ? new Float32Array(W * H * 4) : new Uint8ClampedArray(W * H * 4);
    const rowR = new Float32Array(width), rowG = new Float32Array(width), rowB = new Float32Array(width), rowA = new Float32Array(width);
    const readRow = (view, off, c, dst) => {
      if (c.type === 1) for (let x = 0; x < width; x++) dst[x] = HALF[view.getUint16(off + 2 * x, true)];
      else if (c.type === 2) for (let x = 0; x < width; x++) dst[x] = view.getFloat32(off + 4 * x, true);
      else for (let x = 0; x < width; x++) dst[x] = view.getUint32(off + 4 * x, true);
    };
    const enc = (v) => (v > 0 ? (v >= 1 ? 255 : OETF[(v * OETF_N + 0.5) | 0]) : 0);
    let last = performance.now();
    for (let b = 0; b < nBlocks; b++) {
      const lo = dv.getUint32(table + 8 * b, true), hi = dv.getUint32(table + 8 * b + 4, true), pos = lo + hi * 4294967296;
      if (!pos || pos + 8 + hdrExtra > u8.length) throw new Error('EXR file is incomplete (block ' + (b + 1) + ' of ' + nBlocks + ' is missing)');
      if (multi && dv.getInt32(pos, true) !== h.partIndex) throw new Error('EXR file is damaged (chunk of another part)');
      const y0 = dv.getInt32(pos + hdrExtra, true), size = dv.getUint32(pos + hdrExtra + 4, true), start = pos + hdrExtra + 8;
      const lines = Math.min(blockLines, height - (y0 - dw.yMin));
      if (lines < 1 || start + size > u8.length) throw new Error('EXR file is damaged');
      const rawLen = lines * bytesPerLine;
      let raw;
      if (size >= rawLen) raw = u8.subarray(start, start + rawLen);               // stored uncompressed
      else if (comp === 'ZIP' || comp === 'ZIPS') raw = predictorAndReorder(inflateZlib(u8, start, start + size, rawLen));
      else if (comp === 'RLE') raw = predictorAndReorder(unRle(u8, start, size, rawLen));
      else if (comp === 'PIZ') raw = unPiz(u8, dv, start, width, lines, chans);
      else if (comp === 'PXR24') raw = unPxr24(u8, start, size, width, lines, chans, rawLen);
      else raw = u8.subarray(start, start + rawLen);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      for (let l = 0; l < lines; l++) {
        const yy = y0 + l - dsp.yMin; if (yy < 0 || yy >= H) continue;
        const base = l * bytesPerLine;
        readRow(view, base + chanOff[sel.r] * 1, chans[sel.r], rowR);
        if (sel.grey) { rowG.set(rowR); rowB.set(rowR); } else { readRow(view, base + chanOff[sel.g], chans[sel.g], rowG); readRow(view, base + chanOff[sel.b], chans[sel.b], rowB); }
        if (sel.a >= 0) readRow(view, base + chanOff[sel.a], chans[sel.a], rowA);
        for (let x = 0; x < width; x++) {
          const xx = x + dw.xMin - dsp.xMin; if (xx < 0 || xx >= W) continue;
          const q = (yy * W + xx) * 4;
          let r = rowR[x], g = rowG[x], bl = rowB[x], a = sel.a >= 0 ? rowA[x] : 1;
          if (opts.linear) { out[q] = r; out[q + 1] = g; out[q + 2] = bl; out[q + 3] = a; continue; }
          if (a < 1) { if (a > 0) { r /= a; g /= a; bl /= a; } else { r = g = bl = 0; } }          // EXR colour is premultiplied
          out[q] = enc(r); out[q + 1] = enc(g); out[q + 2] = enc(bl); out[q + 3] = a >= 1 ? 255 : a > 0 ? Math.round(a * 255) : 0;
        }
      }
      if (performance.now() - last > 12) { await tick(); last = performance.now(); }
    }
    return { width: W, height: H, data: out, info: { compression: comp, layer: sel.label, layers: [...new Set(layers)], multipart: multi, grey: !!sel.grey, alpha: sel.a >= 0,
                                                    types: [...new Set(chans.map((c) => ['uint', 'half', 'float'][c.type]))] } };
  }
  return { decode, inflateZlib };
})();

if (typeof module !== 'undefined') module.exports = EXR;
