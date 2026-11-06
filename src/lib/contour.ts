/**
 * Garis kontur dari medan skalar (marching squares). Murni dan tanpa DOM, jadi bisa diuji.
 * `field` berisi (nx+1) x (ny+1) titik sudut baris demi baris. Untuk tiap sel, `emit` dipanggil per ruas garis
 * dengan koordinat piksel (titik sudut kiri-atas sel = (i*cell, j*cell)).
 */
export type Emit = (x1: number, y1: number, x2: number, y2: number) => void;

export function contourSegments(field: Float32Array, nx: number, ny: number, cell: number, level: number, emit: Emit): void {
  const stride = nx + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = field[j * stride + i]!;
      const b = field[j * stride + i + 1]!;
      const d = field[(j + 1) * stride + i]!;
      const c = field[(j + 1) * stride + i + 1]!;
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = i * cell;
      const y0 = j * cell;
      // Titik potong tiap sisi (interpolasi linear).
      const tx = x0 + ((level - a) / (b - a)) * cell; // atas
      const bx = x0 + ((level - d) / (c - d)) * cell; // bawah
      const ly = y0 + ((level - a) / (d - a)) * cell; // kiri
      const ry = y0 + ((level - b) / (c - b)) * cell; // kanan
      const X1 = x0 + cell;
      const Y1 = y0 + cell;
      const TL = () => emit(tx, y0, x0, ly);
      const TR = () => emit(tx, y0, X1, ry);
      const BR = () => emit(bx, Y1, X1, ry);
      const BL = () => emit(bx, Y1, x0, ly);
      switch (idx) {
        case 1:
        case 14:
          BL();
          break;
        case 2:
        case 13:
          BR();
          break;
        case 3:
        case 12:
          emit(x0, ly, X1, ry);
          break;
        case 4:
        case 11:
          TR();
          break;
        case 6:
        case 9:
          emit(tx, y0, bx, Y1);
          break;
        case 7:
        case 8:
          TL();
          break;
        case 5:
        case 10: {
          const centerHigh = (a + b + c + d) / 4 > level;
          // 5: b dan d tinggi. 10: a dan c tinggi.
          const joinHigh = idx === 5 ? !centerHigh : centerHigh;
          if (joinHigh) {
            TR();
            BL();
          } else {
            TL();
            BR();
          }
          break;
        }
      }
    }
  }
}
