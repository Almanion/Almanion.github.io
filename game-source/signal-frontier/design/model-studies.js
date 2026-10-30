/* Visual studies only. No simulation types, purchases or map objects are added. */
(function (root) {
  "use strict";
  const specs = [
    ["repair", "Ремонтная мастерская", "building", 160, 120, 42],
    ["clinic", "Полевой медпункт", "building", 120, 80, 35],
    ["supply", "Склад снабжения", "building", 120, 120, 40],
    ["watch", "Наблюдательная мачта", "building", 80, 80, 78],
    ["bunker", "Полевой бункер", "building", 120, 80, 32],
    ["gate", "Управляемые ворота", "building", 160, 40, 36],
    ["extractor", "Экстрактор материи", "planned", 120, 120, 42],
    ["platform", "Тяжёлая платформа", "planned", 180, 160, 65],
    ["command", "Командный модуль", "planned", 120, 100, 65],
    ["factory", "Сборочный модуль", "planned", 180, 140, 50],
    ["reserve", "Резервный двор", "planned", 160, 140, 40],
    ["medic", "Медик", "fighter", 30, 28, 38],
    ["shield", "Щитоносец", "fighter", 38, 38, 38],
    ["grenadier", "Гранатомётчик", "fighter", 40, 34, 36],
    ["armored", "Бронемашина", "fighter", 60, 42, 28],
    ["siege", "Осадный танк", "fighter", 68, 52, 35],
    ["oplot", "Оплот", "fighter", 72, 66, 62],
    ["convoy", "Конвой снабжения", "fighter", 74, 42, 30],
    ["service", "Ремонтный транспорт", "fighter", 64, 40, 35],
    ["drill", "Буровая платформа", "boss", 170, 150, 70],
    ["commander", "Осадный комендант", "boss", 100, 76, 56],
    ["keeper", "Смотритель ретранслятора", "boss", 170, 150, 95],
    ["airscout", "Воздушный разведчик", "air", 52, 48, 52],
    ["transport", "Воздушный транспорт", "air", 94, 76, 60],
    ["gunship", "Ударный аппарат", "air", 78, 66, 55],
    ["saboteur", "Диверсант", "fighter", 30, 28, 34],
    ["detector", "Модуль обнаружения", "planned", 62, 62, 65],
  ].map(([id, name, group, w, h, height]) =>
    Object.freeze({ id, name, group, w, h, height }),
  );

  function create(artwork) {
    const k = artwork.toolkit,
      {
        slab,
        plate,
        cap,
        bone,
        canister,
        barrel,
        feet,
        track,
        seam,
        lamp,
        point,
        poly,
        line,
        ellipse,
        chamfer,
        disc,
      } = k,
      { dark, ceramic, alloy, enemy, copper, wreck } = k.materials,
      TAU = Math.PI * 2,
      clamp = (x) => Math.max(0, Math.min(1, x));

    function arm(c, a, x, y, z, reach, progress, material = alloy) {
      const elbow = [x + reach * 0.5, y, z + 9 + progress * 4],
        hand = [x + reach, y, 7 + progress * 12];
      canister(c, x, y, 4, z - 3, 5, a, dark);
      bone(c, [x, y, z], elbow, 4, a, material);
      bone(c, elbow, hand, 3, a, dark);
      for (const side of [-1, 1])
        bone(
          c,
          hand,
          [hand[0] + 4, y + side * (2 + progress), hand[2] - 3],
          1.6,
          a,
          material,
        );
    }
    function crate(c, x, y, w, h, z, a, material = alloy) {
      cap(c, x, y, w, h, z, 12, a, material);
      for (const side of [-1, 1])
        slab(c, x + side * w * 0.3, y, 2.5, h + 1, z + 12, 2, a, dark);
    }
    function wheels(c, d, n, length, spread, z = 5) {
      const a = d.a,
        r = 6,
        step = length / (n - 1);
      for (const side of [-1, 1])
        for (let i = 0; i < n; i++) {
          const x = -length / 2 + i * step,
            y = side * spread,
            ring = (rr) =>
              Array.from({ length: 10 }, (_, j) => {
                const q = (j * TAU) / 10;
                return point(x + Math.cos(q) * rr, y, z + Math.sin(q) * rr, a);
              });
          poly(c, ring(r), dark.side, dark.edge);
          poly(c, ring(r * 0.62), alloy.side);
          const spin = d.moving ? d.t * 8 : 0;
          line(
            c,
            [
              point(x - Math.cos(spin) * 3, y, z - Math.sin(spin) * 3, a),
              point(x + Math.cos(spin) * 3, y, z + Math.sin(spin) * 3, a),
            ],
            alloy.edge,
            1.2,
          );
        }
    }
    function building(c, d) {
      const { id, w, h } = d.spec,
        a = d.a,
        action = d.action,
        q = d.q,
        m = d.enemy ? enemy : alloy;
      slab(c, 0, 0, w - 8, h - 8, 0, 3, a, dark);
      if (d.building < 0.75) {
        for (const x of [-1, 1])
          for (const y of [-1, 1])
            slab(
              c,
              x * (w / 2 - 14),
              y * (h / 2 - 14),
              4,
              4,
              3,
              4 + d.building * 45,
              a,
              m,
            );
        if (d.building < 0.4) return;
        for (const side of [-1, 1])
          bone(
            c,
            [-w / 2 + 14, side * (h / 2 - 14), 22],
            [w / 2 - 14, side * (h / 2 - 14), 22],
            2,
            a,
            m,
          );
        return;
      }
      if (id === "repair") {
        for (const side of [-1, 1]) {
          cap(c, side * 55, -3, 30, 92, 3, 22, a, alloy);
          slab(c, side * 55, -5, 25, 80, 25, 4, a, ceramic);
          arm(
            c,
            a,
            side * 43,
            -12,
            24,
            -side * (action ? 23 : 5),
            action ? q : 0,
          );
          seam(
            c,
            [
              [side * 31, -40],
              [side * 31, 44],
            ],
            4,
            a,
            "#a4edd9",
            1.5,
          );
        }
        for (const side of [-1, 1])
          slab(c, side * 24, 4, 5, 90, 3, 2, a, alloy);
        if (action) {
          track(c, { ...d.p, angle: a }, 36, 13, alloy);
          cap(c, 0, 5, 31, 24, 6, 11, a, ceramic);
        }
      } else if (id === "clinic") {
        for (const side of [-1, 1]) {
          cap(c, side * 30, -12, 44, 42, 3, 23, a, ceramic);
          cap(c, side * 30, -12, 33, 31, 26, 4, a, alloy);
          slab(c, side * 31, 20, 18, 13, 3, 3, a, dark);
          bone(c, [side * 31, 20, 6], [side * 31, 20, 16], 3, a, alloy);
          if (action) arm(c, a, side * 38, 5, 19, -side * 7, q, ceramic);
        }
        seam(
          c,
          [
            [-9, -8],
            [-9, -19],
            [9, -19],
          ],
          31,
          a,
          "#a4edd9",
          2,
        );
        bone(c, [-50, -25, 18], [-50, -25, 38], 1.5, a, dark);
      } else if (id === "supply") {
        const load = action ? Math.max(1, Math.ceil(q * 6)) : 6;
        for (let i = 0; i < 6; i++) {
          const x = ((i % 3) - 1) * 34,
            y = i < 3 ? -29 : 16;
          slab(c, x, y, 29, 34, 3, 2, a, dark);
          if (i < load) crate(c, x, y, 28, 31, 5, a, i % 2 ? alloy : ceramic);
        }
        arm(c, a, 45, 39, 21, action ? -20 : -4, action ? q : 0);
      } else if (id === "watch" || id === "detector") {
        for (let i = 0; i < 3; i++) {
          const angle = a + (i * TAU) / 3;
          cap(c, 23, 0, 28, 9, 3, 4, angle, alloy);
          bone(c, [27, 0, 6], [0, 0, 43], 2.8, angle, dark);
        }
        cap(c, 0, 0, 13, 13, 3, 58, a, dark);
        const turn = a + (action ? Math.sin(q * TAU) * 0.3 : 0);
        if (id === "watch") {
          cap(c, 1, 0, 28, 11, 61, 8, turn, ceramic);
          slab(c, 15, 0, 2, 8, 64, 4, turn, dark);
          lamp(c, 16, 0, 67, turn, 1.4, "#a4edd9");
        } else {
          plate(c, disc(18, 0, 0, 12), 53, 4, turn, alloy);
          plate(c, disc(12, 0, 0, 12), 57, 2, turn, dark);
          for (let i = 0; i < 3; i++)
            slab(c, 16, 0, 3, 9, 57, 7, turn + (i * TAU) / 3, ceramic);
        }
      } else if (id === "bunker") {
        plate(
          c,
          [
            [-53, -29],
            [53, -29],
            [56, 6],
            [44, 31],
            [-44, 31],
            [-56, 6],
          ],
          3,
          22,
          a,
          alloy,
        );
        cap(c, 0, -3, 92, 43, 25, 5, a, ceramic);
        for (let i = -1; i <= 1; i++) {
          slab(c, i * 27, 29, 17, 3, 12, 6, a, dark);
          if (action) {
            slab(c, i * 27, 32, 4, 11, 13, 3, a, alloy);
            lamp(c, i * 27, 39, 16, a, 1.1, "#a4edd9");
          }
        }
        slab(
          c,
          0,
          -29,
          20,
          2,
          3 + (action ? q * 9 : 0),
          17 * (1 - (action ? q : 0)),
          a,
          dark,
        );
      } else if (id === "gate") {
        for (const side of [-1, 1]) {
          cap(c, side * 65, 0, 28, 32, 3, 27, a, alloy);
          slab(c, side * 65, 0, 22, 27, 30, 4, a, ceramic);
          const x = side * (25 + (action ? q : 0) * 47);
          slab(c, x, 0, 49 * (1 - (action ? q : 0) * 0.75), 5, 3, 23, a, dark);
          seam(
            c,
            [
              [side * 2 + (action ? side * q * 47 : 0), -3],
              [side * 43 + (action ? side * q * 12 : 0), -3],
            ],
            25,
            a,
            "#a4edd9",
            2,
          );
        }
      } else if (id === "extractor") {
        plate(c, disc(45, 0, 0, 12), 3, 7, a, alloy);
        plate(c, disc(31, 0, 0, 12), 10, 1, a, dark);
        for (const side of [-1, 1]) {
          cap(c, side * 42, 0, 23, 42, 10, 14, a, ceramic);
          arm(
            c,
            a,
            side * 32,
            0,
            25,
            -side * 25,
            action ? (side > 0 ? q : 1 - q) : 0,
          );
        }
        crate(c, 4, 43, 30, 20, 3, a, copper);
        if (action) lamp(c, 0, 0, 8, a, 3 + q * 2, "#a4edd9");
      } else if (id === "platform" || id === "factory") {
        const heavy = id === "platform";
        for (const side of [-1, 1]) {
          slab(c, side * 59, 0, 25, h - 28, 3, heavy ? 12 : 29, a, m);
          slab(c, side * 42, 0, 4, h - 20, 3, 3, a, copper);
          bone(
            c,
            [side * 63, -h * 0.3, 12],
            [side * 63, -h * 0.3, 54],
            5,
            a,
            m,
          );
        }
        slab(c, 0, -h * 0.3, 133, 10, 53, 7, a, heavy ? ceramic : enemy);
        const x = action ? Math.sin(q * TAU) * 27 : -32;
        slab(c, x, -h * 0.3, 19, 16, 50, 9, a, dark);
        bone(
          c,
          [x, -h * 0.3, 50],
          [x, -h * 0.3, action ? 25 + q * 13 : 38],
          3,
          a,
          copper,
        );
        if (!heavy) {
          cap(c, 0, -h * 0.34, 99, 32, 3, 33, a, enemy);
          for (const side of [-1, 1])
            slab(c, side * 26, 8, 45, h * 0.55, 35, 6, a, enemy);
        }
      } else if (id === "command") {
        cap(c, 0, 0, 98, 76, 3, 20, a, enemy);
        cap(c, -14, -8, 50, 42, 23, 12, a, dark);
        bone(c, [-19, -8, 35], [-19, -8, 63], 3, a, copper);
        for (const side of [-1, 1])
          slab(c, -18, side * 13 - 8, 31, 5, 56, 4, a, enemy);
        for (let i = 0; i < 3; i++)
          lamp(
            c,
            32,
            -18 + i * 12,
            26,
            a,
            1.7,
            action && q > i / 3 ? "#efae8c" : "#656c60",
          );
      } else if (id === "reserve") {
        for (let i = 0; i < 3; i++) {
          const angle = a + (i * TAU) / 3;
          cap(c, 44, 0, 46, 30, 3, 18, angle, enemy);
          crate(c, 44, 0, 32, 22, 21, angle, copper);
        }
        cap(c, 0, 0, 34, 34, 3, 28, a, dark);
        for (const side of [-1, 1])
          seam(
            c,
            [
              [side * 18, 10],
              [side * 18, 60],
            ],
            4,
            a,
            "#efae8c",
            2,
          );
      }
    }

    function infantry(c, d) {
      const { id } = d.spec,
        a = d.a,
        q = d.action ? d.q : 0,
        spy = id === "saboteur",
        mat = spy ? dark : ceramic,
        p = { ...d.p, angle: a, move: d.action ? 0 : d.p.move };
      feet(c, p, id === "shield" ? 7 : 5, 3.5, mat);
      cap(c, -1, 0, 12, 13, 11, 5, a, dark);
      cap(c, 0, 0, spy ? 12 : 16, 15, 16, 9, a, mat);
      cap(c, 1, 0, 10, 9, 26, 8, a, mat);
      seam(
        c,
        [
          [6, -3],
          [6, 3],
        ],
        31,
        a,
        "#a4edd9",
        1.5,
      );
      if (id === "medic") {
        cap(c, -8, 0, 7, 13, 16, 19, a, alloy);
        seam(
          c,
          [
            [-10, -4],
            [-10, 4],
          ],
          35,
          a,
          "#a4edd9",
          2,
        );
        arm(c, a, 0, -8, 20, d.action ? 15 : 4, q, ceramic);
        bone(c, [0, 7, 21], [6, 8, 15], 3, a, alloy);
      } else if (id === "shield") {
        const x = 9 + q * 2;
        bone(c, [1, -7, 22], [x, -7, 16], 4, a, alloy);
        plate(
          c,
          [
            [x - 2, -15],
            [x + 2, -12],
            [x + 3, 12],
            [x - 2, 15],
          ],
          3,
          28,
          a,
          ceramic,
        );
        slab(c, x + 1, 0, 3, 5, 6, 22, a, alloy);
        bone(c, [0, 7, 23], [7, 8, 18], 3, a, dark);
      } else if (id === "grenadier") {
        crate(c, -8, 0, 6, 15, 15, a, alloy);
        for (const side of [-1, 1])
          bone(c, [0, side * 7, 22], [11, side * 5, 18], 3, a, alloy);
        cap(c, 13, 0, 16, 13, 18, 7, a, dark);
        barrel(c, a, 21, 12, 8, 12 - q * 2, alloy, q);
        if (d.action) slab(c, 9, -10, 9, 4, 19, 4, a, copper);
      } else {
        cap(c, -7, 0, 6, 10, 17, 9, a, alloy);
        bone(c, [0, -6, 22], [10 + q * 5, -7, 16], 2.7, a, alloy);
        bone(c, [10 + q * 5, -7, 16], [17 + q * 6, -7, 14], 1.7, a, dark);
        bone(c, [0, 6, 22], [5, 7, 14], 2.7, a, dark);
      }
    }

    function vehicle(c, d) {
      const { id } = d.spec,
        a = d.a,
        q = d.action ? d.q : 0,
        siege = id === "siege",
        supply = id === "convoy",
        service = id === "service";
      if (siege) track(c, { ...d.p, angle: a }, 57, 20, alloy);
      else wheels(c, d, 3, supply ? 50 : 38, supply ? 19 : 17);
      plate(
        c,
        chamfer(supply ? 70 : siege ? 60 : 52, siege ? 34 : 30, 9),
        7,
        9,
        a,
        alloy,
      );
      cap(c, 15, 0, supply ? 20 : 26, 25, 16, 8, a, ceramic);
      if (supply) {
        for (const x of [-23, -2]) crate(c, x, 0, 18, 28, 16, a, copper);
        if (d.action) arm(c, a, -28, -16, 19, 21, q);
      } else if (service) {
        crate(c, -15, 0, 23, 26, 16, a, alloy);
        arm(c, a, -12, -12, 28, 16 + q * 8, q, ceramic);
      } else if (siege) {
        cap(c, -5, 0, 30, 24, 16, 12, a, dark);
        barrel(c, a, 30, 43, 6, -3, ceramic, q * 2);
        for (const side of [-1, 1]) {
          bone(
            c,
            [-8, side * 13, 12],
            [-12, side * (24 + q * 7), 4],
            4,
            a,
            dark,
          );
          cap(c, -12, side * (24 + q * 7), 12, 7, 0, 4, a, alloy);
        }
      } else {
        cap(c, -8, 0, 20, 17, 16, 9, a, dark);
        barrel(c, a, 24, 23, 4, -3, ceramic, q * 2);
        slab(c, 19, 0, 8, 22, 21, 2, a, dark);
      }
    }

    function walker(c, d) {
      const a = d.a,
        q = d.action ? d.q : 0,
        p = d.p;
      for (const side of [-1, 1]) {
        const step = root.SignalUnitModels.contact(
            p,
            side < 0 ? 0 : 0.5,
            0.75,
            3,
          ),
          x = d.action ? -side * 3 : step.x,
          lift = d.action ? 0 : step.lift;
        cap(c, x + 3, side * 24, 27, 16, lift, 5, a, dark);
        bone(
          c,
          [0, side * 13, 29],
          [x * 0.4 - 5, side * 25, 17 + lift],
          9,
          a,
          dark,
        );
        bone(
          c,
          [x * 0.4 - 5, side * 25, 17 + lift],
          [x, side * 24, 5 + lift],
          7,
          a,
          alloy,
        );
        cap(c, x * 0.4 - 5, side * 25, 14, 13, 17 + lift, 6, a, ceramic);
      }
      cap(c, -2, 0, 34, 34, 29, 18, a, dark);
      plate(c, chamfer(31, 29, 8), 47, 8, a, ceramic);
      cap(c, 1, -23, 28, 13, 33, 16, a, alloy);
      barrel(c, a, 42, 35, 8, 0, ceramic, q * 3, -23);
      cap(c, -7, 24, 20, 13, 34, 15, a, alloy);
      for (let i = 0; i < 3; i++)
        slab(c, -12 + i * 5, 24, 2, 11, 49, 5 + q * 3, a, dark);
      seam(
        c,
        [
          [13, -6],
          [13, 6],
        ],
        48,
        a,
        "#a4edd9",
        2,
      );
    }

    function boss(c, d) {
      const { id } = d.spec,
        a = d.a,
        q = d.action ? d.q : 0;
      if (id === "commander") {
        track(c, { ...d.p, angle: a }, 88, 30, enemy);
        plate(
          c,
          [
            [-42, -23],
            [23, -27],
            [45, -15],
            [45, 15],
            [23, 27],
            [-42, 23],
          ],
          7,
          15,
          a,
          enemy,
        );
        cap(c, -11, 0, 42, 39, 22, 15, a, dark);
        barrel(c, a, 38, 49, 10, 1, copper, q * 4);
        bone(c, [-30, -19, 22], [-30, -19, 58], 2.5, a, dark);
        slab(c, -30, -19, 15, 4, 53, 3, a, enemy);
        for (const side of [-1, 1])
          cap(c, 24, side * 32, 23, 12, 0, 6 + q * 3, a, dark);
      } else if (id === "drill") {
        for (const side of [-1, 1])
          for (const front of [-1, 1]) {
            cap(c, front * 59, side * 51, 30, 24, 0, 7, a, dark);
            bone(
              c,
              [front * 35, side * 24, 30],
              [front * 59, side * 51, 7],
              8,
              a,
              enemy,
            );
          }
        plate(c, disc(43, 0, 0, 12), 24, 18, a, enemy);
        plate(c, disc(28, 0, 0, 12), 42, 4, a, dark);
        canister(c, 0, 0, 13, 9 + q * 8, 48, a, copper);
        for (let i = 0; i < 3; i++)
          slab(
            c,
            0,
            0,
            37,
            6,
            15 + i * 12 + q * 5,
            3,
            a + (d.action ? q : 0) * TAU,
            dark,
          );
        for (const side of [-1, 1]) {
          cap(c, 0, side * 47, 39, 17, 21, 24, a, dark);
          for (let i = 0; i < 4; i++)
            slab(c, -13 + i * 8, side * (47 + q * 5), 3, 15, 45, 12, a, copper);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const angle = a + (i * TAU) / 3;
          cap(c, 52, 0, 47, 31, 0, 12, angle, dark);
          cap(c, 62, 0, 24, 24, 12, 18, angle, enemy);
          seam(
            c,
            [
              [20, 0],
              [61, 0],
            ],
            14,
            angle,
            d.action ? "#efae8c" : "#8f8675",
            3,
          );
          slab(c, 32 + q * 6, 0, 13, 28, 39, 40 - q * 14, angle, copper);
        }
        canister(c, 0, 0, 25, 9, 44, a, dark);
        plate(c, disc(31, 0, 0, 10), 53, 9, a, enemy);
        canister(c, 0, 0, 12, 62, 20, a, dark);
        lamp(c, 0, 0, 84, a, 4, "#efae8c");
      }
    }

    function aircraft(c, d) {
      const { id } = d.spec,
        a = d.a,
        q = d.action ? d.q : 0,
        z = 22 + (d.moving ? Math.sin(d.t * 2) * 0.6 : 0);
      if (id === "airscout") {
        for (let i = 0; i < 3; i++) {
          const turn = a + (i * TAU) / 3;
          bone(c, [0, 0, z + 3], [19, 0, z], 3, turn, alloy);
          canister(c, 19, 0, 6, z - 2, 4, turn, dark);
          seam(
            c,
            [
              [16, -2],
              [22, 2],
            ],
            z + 3,
            turn,
            "#a4edd9",
            1.3,
          );
        }
        cap(c, 0, 0, 15, 15, z, 10, a, ceramic);
        cap(c, 4, 0, 8, 9, z - 6, 6, a, dark);
        lamp(c, 8, 0, z - 1, a, 1.6, "#a4edd9");
      } else {
        const transport = id === "transport";
        for (const side of [-1, 1]) {
          cap(
            c,
            -4,
            side * (transport ? 27 : 23),
            transport ? 47 : 35,
            15,
            z - 5,
            9,
            a,
            alloy,
          );
          bone(c, [-6, side * 12, z + 5], [-7, side * 25, z + 1], 5, a, dark);
          if (!transport)
            barrel(c, a, z + 1, 26, 5, 5, ceramic, q * 2, side * 23);
        }
        plate(
          c,
          [
            [-30, -14],
            [14, -16],
            [35, -7],
            [35, 7],
            [14, 16],
            [-30, 14],
          ],
          z,
          12,
          a,
          ceramic,
        );
        cap(c, 18, 0, 17, 17, z + 9, 5, a, dark);
        if (transport) {
          slab(c, -26, 0, 15, 22, z - 4 - q * 12, 4, a, alloy);
          for (const side of [-1, 1])
            bone(
              c,
              [-15, side * 26, z - 5],
              [-15, side * 30, 3 + z * (1 - q)],
              3,
              a,
              dark,
            );
        } else {
          for (const side of [-1, 1])
            plate(
              c,
              [
                [-15, side * 13],
                [-28, side * 33],
                [2, side * 26],
                [14, side * 13],
              ],
              z + 3,
              3,
              a,
              alloy,
            );
        }
      }
    }

    function draw(c, id, state = {}) {
      const spec = specs.find((s) => s.id === id);
      if (!spec) throw Error("Unknown visual study: " + id);
      const mode = state.mode || "idle",
        t = state.time || 0,
        q = clamp(state.progress ?? 0.5),
        dead = mode === "wreck",
        d = {
          spec,
          a: state.angle || 0,
          t,
          q,
          moving: mode === "move",
          action: mode === "action" && !dead,
          enemy: [
            "command",
            "factory",
            "reserve",
            "drill",
            "commander",
            "keeper",
          ].includes(id),
          building: mode === "build" ? q : 1,
          p: {
            phase: t * 5,
            move: mode === "move" ? 1 : 0,
            angle: state.angle || 0,
            cycle: id === "oplot" ? 36 : 32,
            left: t * 25,
            right: t * 25,
          },
        };
      c.save();
      try {
        if (dead) {
          cap(c, 0, 0, spec.w * 0.7, spec.h * 0.65, 0, 5, d.a, wreck);
          cap(
            c,
            -spec.w * 0.2,
            spec.h * 0.1,
            spec.w * 0.25,
            spec.h * 0.3,
            4,
            7,
            d.a,
            dark,
          );
          bone(
            c,
            [-spec.w * 0.3, -spec.h * 0.2, 3],
            [spec.w * 0.35, 0, 7],
            Math.max(3, spec.w * 0.04),
            d.a,
            wreck,
          );
          if (["watch", "detector", "oplot", "keeper"].includes(id))
            bone(
              c,
              [-spec.w * 0.2, 0, 4],
              [spec.w * 0.4, spec.h * 0.3, 8],
              4,
              d.a,
              wreck,
            );
          return;
        }
        if (["building", "planned"].includes(spec.group)) building(c, d);
        else if (["medic", "shield", "grenadier", "saboteur"].includes(id))
          infantry(c, d);
        else if (["armored", "siege", "convoy", "service"].includes(id))
          vehicle(c, d);
        else if (id === "oplot") walker(c, d);
        else if (spec.group === "boss") boss(c, d);
        else aircraft(c, d);
        if (mode === "damaged") {
          seam(
            c,
            [
              [-spec.w * 0.2, 0],
              [0, 4],
              [spec.w * 0.18, -3],
            ],
            Math.min(25, spec.height * 0.5),
            d.a,
            "#16282a",
            3,
          );
          slab(c, -spec.w * 0.25, spec.h * 0.3, 12, 5, 0, 3, d.a, wreck);
        }
      } finally {
        c.restore();
      }
    }
    return { draw, specs };
  }
  root.SignalModelStudies = { create, specs };
})(window);
