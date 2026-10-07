import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Experience } from "./Experience";
import { UI } from "./ChatUI";

// The 3D avatar/chat experience pulls in three.js + react-three-fiber, by far
// the heaviest dependency in the app. It's only needed on the /chat route, so
// it's kept in its own module and lazy-loaded from App.jsx (React.lazy) rather
// than bundled into the main chunk every user has to download up front.
export default function ChatPage() {
  return (
    <>
      <Loader />
      <Leva hidden />
      <UI />
      <Canvas shadows camera={{ position: [0, 0, 1], fov: 30 }}>
        <Experience />
      </Canvas>
    </>
  );
}
