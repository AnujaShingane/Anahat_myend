import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useChat } from "../features/chat/useChat";

const facialExpressions = {
  default: {},
  smile: {
    browInnerUp: 0.17,
    eyeSquintLeft: 0.4,
    eyeSquintRight: 0.44,
    noseSneerLeft: 0.17,
    noseSneerRight: 0.14,
    mouthPressLeft: 0.61,
    mouthPressRight: 0.41,
  },
  sad: {
    mouthFrownLeft: 1,
    mouthFrownRight: 1,
    mouthShrugLower: 0.78,
    browInnerUp: 0.45,
    eyeSquintLeft: 0.72,
    eyeSquintRight: 0.75,
    eyeLookDownLeft: 0.5,
    eyeLookDownRight: 0.5,
    jawForward: 1,
  },
  surprised: {
    eyeWideLeft: 0.5,
    eyeWideRight: 0.5,
    jawOpen: 0.35,
    mouthFunnel: 1,
    browInnerUp: 1,
  },
  angry: {
    browDownLeft: 1,
    browDownRight: 1,
    eyeSquintLeft: 1,
    eyeSquintRight: 1,
    jawForward: 1,
    jawLeft: 1,
    mouthShrugLower: 1,
    noseSneerLeft: 1,
    noseSneerRight: 0.42,
  },
};

const corresponding = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

let setupMode = false;

export function Avatar(props) {
  const { nodes, materials, scene } = useGLTF("/models/6925715a786317131c43e0df.glb");
  const { message, onMessagePlayed } = useChat();

  const [lipsync, setLipsync] = useState();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [facialExpression, setFacialExpression] = useState("default");
  const [animation, setAnimation] = useState("Idle");
  
  const speechStartTime = useRef(0);
  const messageEndTimeout = useRef(null);

  useEffect(() => {
    console.log('Avatar received message:', message);
    
    // Clear any existing timeout
    if (messageEndTimeout.current) {
      clearTimeout(messageEndTimeout.current);
      messageEndTimeout.current = null;
    }
    
    if (!message) {
      setAnimation("Idle");
      setIsSpeaking(false);
      setLipsync(null);
      setFacialExpression("default");
      return;
    }
    
    // Set animation based on message - but only use talking animations
    /*const animName = message.animation || "Talking_1";
    if (animName.includes("Talking") || animName === "Idle") {
      setAnimation(animName);
    } else {
      setAnimation("Talking_1"); // Default to talking
    }*/
    setAnimation("Idle");
    
    // Set facial expression
    const expression = message.facialExpression || "default";
    setFacialExpression(expression);
    console.log('Set facial expression:', expression);
    
    // Set lip-sync data with proper timing
    if (message.lipsync && message.lipsync.mouthCues) {
      setLipsync(message.lipsync);
      setIsSpeaking(true);
      speechStartTime.current = message.startTime || Date.now();
      
      console.log('Lip-sync data loaded. Duration:', 
        message.lipsync.mouthCues[message.lipsync.mouthCues.length - 1]?.end);
      
      // Calculate when speech should end
      const speechDuration = message.lipsync.mouthCues[message.lipsync.mouthCues.length - 1]?.end || 5;
      
      // Set timeout to stop lip-sync exactly when speech ends
      messageEndTimeout.current = setTimeout(() => {
        console.log('Speech duration completed');
        setIsSpeaking(false);
        setLipsync(null);
        setAnimation("Idle");
      }, speechDuration * 1000 + 500); // Add small buffer
    }
    
    // Cleanup on unmount or message change
    return () => {
      if (messageEndTimeout.current) {
        clearTimeout(messageEndTimeout.current);
      }
    };
    
  }, [message]);

  const { animations } = useGLTF("/models/animations.glb");
  const group = useRef();
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    if (actions[animation]) {
      console.log('Playing animation:', animation);
      actions[animation]
        .reset()
        .fadeIn(mixer.stats.actions.inUse === 0 ? 0 : 0.5)
        .play();
      return () => actions[animation].fadeOut(0.5);
    }
  }, [animation, actions, mixer]);

  const lerpMorphTarget = (target, value, speed = 0.1) => {
    scene.traverse((child) => {
      if (child.isSkinnedMesh && child.morphTargetDictionary) {
        const index = child.morphTargetDictionary[target];
        if (index === undefined || child.morphTargetInfluences[index] === undefined) {
          return;
        }
        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
          child.morphTargetInfluences[index],
          value,
          speed
        );

        if (!setupMode) {
          try {
            set({ [target]: value });
          } catch (e) {}
        }
      }
    });
  };

  const [blink, setBlink] = useState(false);
  const [winkLeft, setWinkLeft] = useState(false);
  const [winkRight, setWinkRight] = useState(false);

  useFrame(() => {
    // Apply facial expressions
    if (!setupMode && nodes.EyeLeft) {
      Object.keys(nodes.EyeLeft.morphTargetDictionary).forEach((key) => {
        const mapping = facialExpressions[facialExpression];
        if (key === "eyeBlinkLeft" || key === "eyeBlinkRight") {
          return; // eyes handled separately
        }
        if (mapping && mapping[key]) {
          lerpMorphTarget(key, mapping[key], 0.1);
        } else {
          lerpMorphTarget(key, 0, 0.1);
        }
      });
    }

    lerpMorphTarget("eyeBlinkLeft", blink || winkLeft ? 1 : 0, 0.5);
    lerpMorphTarget("eyeBlinkRight", blink || winkRight ? 1 : 0, 0.5);

    // SYNCHRONIZED LIPSYNC
    if (setupMode) {
      return;
    }

    const appliedMorphTargets = [];
    
    if (isSpeaking && lipsync && lipsync.mouthCues && lipsync.mouthCues.length > 0) {
      // Calculate elapsed time since speech started
      const currentTime = (Date.now() - speechStartTime.current) / 1000;
      
      // Find current mouth cue based on time
      let currentCue = null;
      for (let i = 0; i < lipsync.mouthCues.length; i++) {
        const cue = lipsync.mouthCues[i];
        if (currentTime >= cue.start && currentTime <= cue.end) {
          currentCue = cue;
          break;
        }
      }
      
      // Apply viseme if found
      if (currentCue) {
        const viseme = corresponding[currentCue.value];
        if (viseme) {
          appliedMorphTargets.push(viseme);
          
          // Calculate interpolation factor for smooth transitions
          const cueProgress = (currentTime - currentCue.start) / (currentCue.end - currentCue.start);
          const intensity = Math.sin(cueProgress * Math.PI); // Smooth curve
          
          lerpMorphTarget(viseme, intensity * 0.8, 0.3);
        }
      }
      
      // Check if speech has ended
      const lastCue = lipsync.mouthCues[lipsync.mouthCues.length - 1];
      if (currentTime > lastCue.end + 0.2) {
        console.log('Lip-sync completed at frame level');
        setIsSpeaking(false);
        setLipsync(null);
      }
    }

    // Reset non-applied visemes smoothly
    Object.values(corresponding).forEach((value) => {
      if (!appliedMorphTargets.includes(value)) {
        lerpMorphTarget(value, 0, 0.15);
      }
    });
  });

  useControls("FacialExpressions", {
    winkLeft: button(() => {
      setWinkLeft(true);
      setTimeout(() => setWinkLeft(false), 300);
    }),
    winkRight: button(() => {
      setWinkRight(true);
      setTimeout(() => setWinkRight(false), 300);
    }),
   animation: {
      value: animation,
      options: animations.map((a) => a.name),
      onChange: (value) => setAnimation(value),
    },
    facialExpression: {
      options: Object.keys(facialExpressions),
      onChange: (value) => setFacialExpression(value),
    },
    enableSetupMode: button(() => {
      setupMode = true;
    }),
    disableSetupMode: button(() => {
      setupMode = false;
    }),
    logMorphTargetValues: button(() => {
      const emotionValues = {};
      if (nodes.EyeLeft) {
        Object.keys(nodes.EyeLeft.morphTargetDictionary).forEach((key) => {
          if (key === "eyeBlinkLeft" || key === "eyeBlinkRight") {
            return;
          }
          const value =
            nodes.EyeLeft.morphTargetInfluences[
              nodes.EyeLeft.morphTargetDictionary[key]
            ];
          if (value > 0.01) {
            emotionValues[key] = value;
          }
        });
      }
      console.log(JSON.stringify(emotionValues, null, 2));
    }),
  });

  const [, set] = useControls("MorphTarget", () => {
    if (!nodes.EyeLeft) return {};
    
    return Object.assign(
      {},
      ...Object.keys(nodes.EyeLeft.morphTargetDictionary).map((key) => {
        return {
          [key]: {
            label: key,
            value: 0,
            min: 0,
            max: 1,
            onChange: (val) => {
              if (setupMode) {
                lerpMorphTarget(key, val, 1);
              }
            },
          },
        };
      })
    );
  });

  // Blinking effect
  useEffect(() => {
    let blinkTimeout;
    const nextBlink = () => {
      blinkTimeout = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          nextBlink();
        }, 200);
      }, THREE.MathUtils.randInt(1000, 5000));
    };
    nextBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />
      <skinnedMesh
        name="Wolf3D_Body"
        geometry={nodes.Wolf3D_Body.geometry}
        material={materials.Wolf3D_Body}
        skeleton={nodes.Wolf3D_Body.skeleton}
      />
      <skinnedMesh
        name="Wolf3D_Outfit_Bottom"
        geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
        material={materials.Wolf3D_Outfit_Bottom}
        skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
      />
      <skinnedMesh
        name="Wolf3D_Outfit_Footwear"
        geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
        material={materials.Wolf3D_Outfit_Footwear}
        skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
      />
      <skinnedMesh
        name="Wolf3D_Outfit_Top"
        geometry={nodes.Wolf3D_Outfit_Top.geometry}
        material={materials.Wolf3D_Outfit_Top}
        skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
      />
      <skinnedMesh
        name="Wolf3D_Hair"
        geometry={nodes.Wolf3D_Hair.geometry}
        material={materials.Wolf3D_Hair}
        skeleton={nodes.Wolf3D_Hair.skeleton}
      />
      <skinnedMesh
        name="EyeLeft"
        geometry={nodes.EyeLeft.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeLeft.skeleton}
        morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
      />
      <skinnedMesh
        name="EyeRight"
        geometry={nodes.EyeRight.geometry}
        material={materials.Wolf3D_Eye}
        skeleton={nodes.EyeRight.skeleton}
        morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
        morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Head"
        geometry={nodes.Wolf3D_Head.geometry}
        material={materials.Wolf3D_Skin}
        skeleton={nodes.Wolf3D_Head.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
      />
      <skinnedMesh
        name="Wolf3D_Teeth"
        geometry={nodes.Wolf3D_Teeth.geometry}
        material={materials.Wolf3D_Teeth}
        skeleton={nodes.Wolf3D_Teeth.skeleton}
        morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
        morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
      />
    </group>
  );
}

useGLTF.preload("/models/6925715a786317131c43e0df.glb");
useGLTF.preload("/models/animations.glb");