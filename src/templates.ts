import { FloorplanData } from "./types";

/** Blank canvas every user sees on first load */
export const EMPTY_FLOORPLAN: FloorplanData = {
  walls: [],
  doors: [],
  windows: [],
  rooms: [],
  scale: { calibrated: false, pixelDistance: 400, physicalLength: 5, unit: "m" },
};

export interface FloorplanTemplate {
  name: string;
  description: string;
  data: FloorplanData;
}

export const templates: FloorplanTemplate[] = [
  {
    name: "Minimalist Studio Apartment",
    description: "Compact open-plan layout featuring a central living space, kitchenette, and private bathroom.",
    data: {
      walls: [
        // Exterior perimeter
        { id: "ext_w1", x1: 200, y1: 200, x2: 800, y2: 200, type: "exterior" },
        { id: "ext_w2", x1: 800, y1: 200, x2: 800, y2: 800, type: "exterior" },
        { id: "ext_w3", x1: 800, y1: 800, x2: 200, y2: 800, type: "exterior" },
        { id: "ext_w4", x1: 200, y1: 800, x2: 200, y2: 200, type: "exterior" },
        // Bathroom enclosure (interior)
        { id: "int_b1", x1: 200, y1: 600, x2: 450, y2: 600, type: "interior" },
        { id: "int_b2", x1: 450, y1: 600, x2: 450, y2: 800, type: "interior" },
        // Kitchen partitioning short wall
        { id: "int_k1", x1: 450, y1: 200, x2: 450, y2: 350, type: "interior" },
      ],
      doors: [
        // Main entrance (hinged facing in, on left wall)
        { id: "door_main", x: 200, y: 350, width: 60, orientation: "v", swing: "e" },
        // Bathroom door (inside bath, on bathroom interior wall)
        { id: "door_bath", x: 350, y: 600, width: 50, orientation: "h", swing: "s" },
      ],
      windows: [
        // Living room windows (on right wall)
        { id: "win_liv1", x: 800, y: 400, width: 100, orientation: "v" },
        { id: "win_liv2", x: 800, y: 600, width: 100, orientation: "v" },
        // Front light (on top wall)
        { id: "win_top", x: 600, y: 200, width: 120, orientation: "h" },
      ],
      rooms: [
        { id: "room_living", name: "Living / Bedroom Area", x: 620, y: 500, estimatedAreaM2: 24.5 },
        { id: "room_kitchen", name: "Kitchenette", x: 320, y: 280, estimatedAreaM2: 8.0 },
        { id: "room_bath", name: "Bathroom", x: 320, y: 700, estimatedAreaM2: 5.5 },
      ],
      scale: {
        calibrated: true,
        pixelDistance: 600, // Distance of top exterior wall (200 to 800)
        physicalLength: 6.0, // represents 6.0 meters
        unit: "m",
      },
    },
  },
  {
    name: "Two-Bedroom Family Flat",
    description: "Classic multi-room layout with separate master suite, kids bedroom, central hallway, kitchen, and balcony connections.",
    data: {
      walls: [
        // Outer box
        { id: "f_ext1", x1: 150, y1: 150, x2: 850, y2: 150, type: "exterior" },
        { id: "f_ext2", x1: 850, y1: 150, x2: 850, y2: 850, type: "exterior" },
        { id: "f_ext3", x1: 850, y1: 850, x2: 150, y2: 850, type: "exterior" },
        { id: "f_ext4", x1: 150, y1: 850, x2: 150, y2: 150, type: "exterior" },

        // Main horizontal spine wall (separates back bedrooms from living)
        { id: "f_spine1", x1: 150, y1: 500, x2: 850, y2: 500, type: "interior" },

        // Divider between Master Bedroom and Kids Bedroom
        { id: "f_div_bed", x1: 500, y1: 150, x2: 500, y2: 500, type: "interior" },

        // Living room / Kitchen partition
        { id: "f_div_kit", x1: 450, y1: 500, x2: 450, y2: 850, type: "interior" },

        // Bathroom enclosure in lower corner of kitchen corridor
        { id: "f_bath1", x1: 150, y1: 700, x2: 320, y2: 700, type: "interior" },
        { id: "f_bath2", x1: 320, y1: 700, x2: 320, y2: 850, type: "interior" },
      ],
      doors: [
        // Main flat entrance (bottom wall of hallway)
        { id: "f_door_main", x: 600, y: 850, width: 68, orientation: "h", swing: "n" },
        // Master Bedroom door
        { id: "f_door_mbed", x: 500, y: 400, width: 55, orientation: "v", swing: "e" },
        // Kids Bedroom door
        { id: "f_door_kbed", x: 500, y: 250, width: 55, orientation: "v", swing: "w" },
        // Bathroom door
        { id: "f_door_bath", x: 230, y: 700, width: 50, orientation: "h", swing: "s" },
      ],
      windows: [
        // Master bedroom window
        { id: "f_win_mbed", x: 680, y: 150, width: 90, orientation: "h" },
        // Kids room window
        { id: "f_win_kbed", x: 320, y: 150, width: 90, orientation: "h" },
        // Living room big sliding glass doors
        { id: "f_win_living", x: 850, y: 680, width: 140, orientation: "v" },
        // Kitchen light
        { id: "f_win_kitchen", x: 150, y: 600, width: 80, orientation: "v" },
      ],
      rooms: [
        { id: "f_r_master", name: "Master Bedroom", x: 680, y: 320, estimatedAreaM2: 18.0 },
        { id: "f_r_kids", name: "Kids Bedroom", x: 320, y: 320, estimatedAreaM2: 15.0 },
        { id: "f_r_living", name: "Living / Lounge Room", x: 650, y: 680, estimatedAreaM2: 24.5 },
        { id: "f_r_kitchen", name: "Kitchen / Dining", x: 320, y: 580, estimatedAreaM2: 12.0 },
        { id: "f_r_bath", name: "Bathroom", x: 230, y: 780, estimatedAreaM2: 6.2 },
      ],
      scale: {
        calibrated: true,
        pixelDistance: 700, // Box width (150 to 850)
        physicalLength: 10.5, // 10.5 meters large
        unit: "m",
      },
    },
  },
  {
    name: "Modern Office Suite",
    description: "Corporate spatial design supporting team integration, dedicated boardrooms, individual executive office suites, and active reception centers.",
    data: {
      walls: [
        // Perimeter
        { id: "o_ext1", x1: 100, y1: 100, x2: 900, y2: 100, type: "exterior" },
        { id: "o_ext2", x1: 900, y1: 100, x2: 900, y2: 800, type: "exterior" },
        { id: "o_ext3", x1: 900, y1: 800, x2: 100, y2: 800, type: "exterior" },
        { id: "o_ext4", x1: 100, y1: 800, x2: 100, y2: 100, type: "exterior" },

        // Conference room partitions (Middle Left)
        { id: "o_conf1", x1: 100, y1: 450, x2: 450, y2: 450, type: "interior" },
        { id: "o_conf2", x1: 450, y1: 450, x2: 450, y2: 800, type: "interior" },

        // Executive Office partitions (Top Right)
        { id: "o_exec1", x1: 550, y1: 100, x2: 550, y2: 400, type: "interior" },
        { id: "o_exec2", x1: 550, y1: 400, x2: 900, y2: 400, type: "interior" },
        // Subdivider between CEO office and Manager office
        { id: "o_exec_sub", x1: 720, y1: 100, x2: 720, y2: 400, type: "interior" },
      ],
      doors: [
        // Office suite main foyer double doors (bottom center)
        { id: "o_door_main", x: 650, y: 800, width: 80, orientation: "h", swing: "n" },
        // Conference room glass door
        { id: "o_door_conf", x: 450, y: 600, width: 60, orientation: "v", swing: "e" },
        // CEO door
        { id: "o_door_ceo", x: 620, y: 400, width: 50, orientation: "h", swing: "n" },
        // Manager door
        { id: "o_door_mgr", x: 800, y: 400, width: 50, orientation: "h", swing: "n" },
      ],
      windows: [
        // Conference glass wall exterior
        { id: "o_win_conf1", x: 100, y: 600, width: 140, orientation: "v" },
        // CEO outer windows
        { id: "o_win_ceo1", x: 630, y: 100, width: 90, orientation: "h" },
        // Manager outer windows
        { id: "o_win_mgr1", x: 810, y: 100, width: 90, orientation: "h" },
        // Open work bay standard windows at the bottom
        { id: "o_win_work1", x: 300, y: 800, width: 120, orientation: "h" },
      ],
      rooms: [
        { id: "o_r_open", name: "Open Workspace / Reception", x: 480, y: 300, estimatedAreaM2: 48.0 },
        { id: "o_r_conf", name: "Corporate Foyer & Boardroom", x: 270, y: 620, estimatedAreaM2: 24.0 },
        { id: "o_r_ceo", name: "Executive CEO Suite", x: 630, y: 250, estimatedAreaM2: 14.5 },
        { id: "o_r_mgr", name: "Project Office", x: 810, y: 250, estimatedAreaM2: 12.0 },
      ],
      scale: {
        calibrated: true,
        pixelDistance: 800, // Total block width (100 to 900)
        physicalLength: 50, // 50 feet
        unit: "ft",
      },
    },
  },
];
