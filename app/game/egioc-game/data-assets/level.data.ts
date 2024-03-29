import { Vector4 } from '../../../engine/math/vector4';

export enum TileRole { Wall, Player, Health, Mana }

export class TileInfo {
  id: string = '';
  region: string = '';
  rotation?: number = 0;
  role?: TileRole = TileRole.Wall;
}

export class LevelData {
  backgroundColor: Vector4 = new Vector4(0.0, 0.0, 0.0, 1.0);
  tileSize: number = 0;
  tileTypes: TileInfo[] = [];
  map: string = '';
}

export const LEVEL_DATA: LevelData[] = [
  {
    backgroundColor: new Vector4(76 / 255.0, 70 / 255.0, 58 / 255.0, 1.0),
    tileSize: 64,
    tileTypes: [
      { id: '@', region: '', role: TileRole.Player },

      { id: 'h', region: 'health1.png', role: TileRole.Health },
      { id: 'm', region: 'mana1.png', role: TileRole.Mana },

      { id: '1', region: 'wall1.png' },
      { id: '2', region: 'wall2.png' },
      { id: '3', region: 'wall3.png' },
      { id: '4', region: 'wall4.png' },
      { id: '5', region: 'wall5.png' },
      { id: '6', region: 'wall6.png' },

      { id: '7', region: 'wall4.png', rotation: 90 },
      { id: '8', region: 'wall4.png', rotation: -90 },
      { id: '9', region: 'wall4.png', rotation: 180 },
    ],

    map:
`445444464444644



  111     111

      @


  111     111

445443445444644
`,
  },
];
