export type SceneContentProps = {
  wireframe: boolean;
};

type PlaceholderBoxProps = {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  wireframe: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

function PlaceholderBox({
  position,
  size,
  color,
  wireframe,
  castShadow = true,
  receiveShadow = true,
}: PlaceholderBoxProps) {
  return (
    <mesh
      position={position}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        metalness={0.04}
        wireframe={wireframe}
      />
    </mesh>
  );
}

/**
 * Placeholder architectural interior used when no GLB is loaded.
 */
export function DemoScene({ wireframe }: SceneContentProps) {
  const wallColor = "#e4dfd4";
  const floorColor = "#8f8a80";
  const tableColor = "#6b5344";
  const sofaColor = "#5c6570";
  const cabinetColor = "#3f3a36";
  const benchColor = "#9c8b74";

  return (
    <group>
      {/* Floor */}
      <PlaceholderBox
        position={[0, -0.04, 0]}
        size={[8.24, 0.08, 6.24]}
        color={floorColor}
        wireframe={wireframe}
        castShadow={false}
      />

      {/* Left wall */}
      <PlaceholderBox
        position={[-4.06, 1.35, 0]}
        size={[0.12, 2.7, 6.24]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Right wall */}
      <PlaceholderBox
        position={[4.06, 1.35, 0]}
        size={[0.12, 2.7, 6.24]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Back wall */}
      <PlaceholderBox
        position={[0, 1.35, -3.06]}
        size={[8.24, 2.7, 0.12]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Front wall — left of door */}
      <PlaceholderBox
        position={[-2.275, 1.35, 3.06]}
        size={[3.55, 2.7, 0.12]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Front wall — right of door */}
      <PlaceholderBox
        position={[2.275, 1.35, 3.06]}
        size={[3.55, 2.7, 0.12]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Front wall — lintel over 0.9m x 2.1m door opening */}
      <PlaceholderBox
        position={[0, 2.4, 3.06]}
        size={[1.0, 0.6, 0.12]}
        color={wallColor}
        wireframe={wireframe}
      />

      {/* Furniture placeholders */}
      <PlaceholderBox
        position={[0, 0.36, -0.2]}
        size={[1.6, 0.72, 0.9]}
        color={tableColor}
        wireframe={wireframe}
      />
      <PlaceholderBox
        position={[0, 0.38, -2.15]}
        size={[2.4, 0.76, 0.86]}
        color={sofaColor}
        wireframe={wireframe}
      />
      <PlaceholderBox
        position={[-3.35, 0.7, 0.4]}
        size={[0.46, 1.4, 1.8]}
        color={cabinetColor}
        wireframe={wireframe}
      />
      <PlaceholderBox
        position={[3.2, 0.22, 1.4]}
        size={[1.1, 0.44, 0.42]}
        color={benchColor}
        wireframe={wireframe}
      />
    </group>
  );
}
