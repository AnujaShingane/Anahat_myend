---
document_type: clinical_assessment_tool
knowledge_category: symptom_detection
source_document: symptom_detection_guide.txt
canonical_version: true
evidence_level: clinical
version: 1.0
---

# Physical Symptom Checklist by Chakra (Body Region)

AUDIT NOTE: this file was omitted from the first delivery of the redesigned knowledge
base and has been added during the cross-check audit. It overlaps with
`structured/symptom_to_chakra.json` (individual named ailments) but organizes information
differently -- by BODY REGION with a detection-question script -- so it is kept as a
separate RAG document rather than merged into the structured JSON.

## Lower Body (Root Chakra Indicators)
Primary symptoms: chronic lower back pain, sciatica or leg pain, knee problems, foot
disorders, constipation, hemorrhoids, obesity or extreme underweight, chronic fatigue,
adrenal issues, immune deficiencies.
Detection questions: "Do you experience lower back or leg pain?" / "How is your energy
level throughout the day?" / "Any digestive issues, particularly with elimination?" /
"How's your relationship with food and eating?"

## Reproductive / Lower Abdomen (Sacral Chakra Indicators)
Primary symptoms: menstrual irregularities, reproductive issues, sexual dysfunction, low
libido, urinary problems, kidney issues, lower abdominal pain, pelvic pain.
Detection questions: "Any reproductive health concerns?" / "How would you describe your
sexual vitality?" / "Do you experience lower abdominal discomfort?"

## Digestive System (Solar Plexus Chakra Indicators)
Primary symptoms: stomach ulcers, acid reflux/GERD, irritable bowel syndrome, chronic
indigestion, liver problems, gallbladder issues, diabetes, eating disorders, middle back
pain.
Detection questions: "How is your digestion?" / "Do you experience stomach problems or
discomfort?" / "Any issues with metabolism or blood sugar?"

## Cardiovascular / Respiratory (Heart Chakra Indicators)
Primary symptoms: heart palpitations, high/low blood pressure, circulatory problems,
asthma, shallow breathing, upper back pain, shoulder tension, frequent colds/infections,
skin issues.
Detection questions: "Any heart or breathing concerns?" / "How does your breathing feel
normally?" / "Do you experience chest tension or tightness?"

## Throat / Neck (Throat Chakra Indicators)
Primary symptoms: chronic sore throat, thyroid disorders, laryngitis/voice problems, TMJ
(jaw tension), neck pain and stiffness, dental problems, gum disease, ear infections.
Detection questions: "Do you have throat or voice issues?" / "Any thyroid problems or
neck tension?" / "How comfortable are you with speaking?"

## Head / Sensory (Third Eye Chakra Indicators)
Primary symptoms: chronic headaches, migraines, vision problems, sinus issues, sleep
disturbances, nightmares, learning difficulties, poor memory, dizziness.
Detection questions: "Do you experience headaches or vision issues?" / "How is your sleep
quality?" / "Any problems with memory or concentration?"

## Neurological (Crown Chakra Indicators)
Primary symptoms: depression, chronic fatigue syndrome, neurological disorders,
sensitivity to light/sound, brain fog, confusion, dissociation, insomnia.
Detection questions: "How would you describe your mental clarity?" / "Do you experience
brain fog or confusion?" / "How is your overall sense of wellbeing?"

**Known internal note:** "Chronic fatigue" appears under Root (Lower Body) and "Chronic
fatigue syndrome" appears under Crown (Neurological) as two separate line items in the
source document. Treat these as two distinct clinical presentations, not a contradiction
-- but confirm this distinction with a clinical lead before the Clinical Analysis Agent
relies on it, since the source document does not itself explain the difference.
