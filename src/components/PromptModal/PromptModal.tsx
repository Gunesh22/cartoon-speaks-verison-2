import React, { useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import {
  X,
  Sparkles,
  FileText,
  Film,
  Smile,
  Grid,
  Copy,
  Check,
  Smartphone,
} from 'lucide-react';

interface WorkflowPrompt {
  id: string;
  step: number;
  name: string;
  shortLabel: string;
  badge: string;
  icon: React.ReactNode;
  prompt: string;
}

const WORKFLOW_PROMPTS: WorkflowPrompt[] = [
  {
    id: 'prompt-1',
    step: 1,
    name: 'Prompt 1 — Add emotions to the script',
    shortLabel: '1. Script Emotions',
    badge: 'Script',
    icon: <FileText className="w-3.5 h-3.5 text-violet-400" />,
    prompt: `You are an expert dialogue emotion-tagging assistant for cartoon animation and voice-over production.

I will provide a script. Preserve the original dialogue exactly and add natural emotion, vocal-action, and pause tags in square brackets directly inline with the dialogue.

### Example of the required output

[thoughtful] Aapne shirt gift ki thi... [chuckles] ya usse pehenne ka decision bhi? [short pause] Shirt uski hai. Pasand aapki hai. [sighs] Dono ek hi honi chahiye, yeh kab tay hua?

### Rules

- Never translate, paraphrase, or rewrite the original dialogue.
- Put tags directly where the emotion, vocal action, or pause occurs.
- Use natural tags such as [angry], [thoughtful], [sarcastic], [whispers], [chuckles], [sighs], [short pause], and [long pause].
- One dialogue may contain multiple tags if its delivery changes.
- Do not add tags mechanically to every sentence.
- Ask me if an important emotion is ambiguous.
- Output only the tagged script, without an introduction or explanation.

The tagged script will be used for storyboard creation and cartoon voice-over production.`,
  },
  {
    id: 'prompt-2',
    step: 2,
    name: 'Prompt 2 — Generate the storyboard',
    shortLabel: '2. Storyboard',
    badge: 'Storyboard',
    icon: <Film className="w-3.5 h-3.5 text-indigo-400" />,
    prompt: `You are a professional 2D cartoon storyboard artist.

I will provide an emotion-tagged script.

Before creating the storyboard, ask me for:

1. Character reference images, if available.
2. If no reference images are available, a description of each character, including appearance, clothing, hairstyle, and art style.
3. Preferred background or setting, if it is not clear from the script.

### Visual requirements

- Every scene must contain exactly ONE character. Never show two characters in one scene.
- The character must dominate the screen and fill most of the frame.
- Show the character's hands, arms, and body posture wherever appropriate. Avoid accidental cropping.
- Match the character's pose, gestures, and facial expression to the dialogue and emotion.
- Maintain consistent identity, clothing, proportions, and art style across scenes.
- Use the supplied references as the source of truth.
- Choose a suitable background that supports the scene without distracting from the character.
- Clearly establish the face orientation: front-facing, three-quarter view, side profile, or tilted head.
- Specify the head angle and direction the face is turned.
- Make the face orientation suitable for later mouth animation.
- Do not include other characters in the background, mirrors, photographs, shadows, or reflections.

### Additional mouth/lips requirements

- Every character in every storyboard panel must be generated WITHOUT A MOUTH AND WITHOUT LIPS.
- Do not draw lips, a smile, a frown, an open mouth, a closed mouth, teeth, a tongue, or any line or shape representing a mouth.
- Do not use skin-coloured lip shapes or lip-like outlines.
- Reconstruct the mouth area naturally using the surrounding face artwork, without a white patch, blur, smudge, scar, or visible editing mark.
- Keep the nose, eyes, eyebrows, cheeks, chin, and other facial features intact.
- Express emotions through the eyes, eyebrows, head angle, body posture, and hand gestures without drawing a mouth.
- This requirement also applies to any character visible inside a phone screen, photograph, mirror, reflection, or other object.
- Do not add a mouth to any character at any stage of storyboard generation. Mouth variations will be created separately in Prompt 3.

### For every scene, specify

- Scene ID and Character ID
- Exact dialogue
- Emotion and intensity
- Facial expression
- Face orientation and head angle
- Body posture and hand gestures
- Background
- Framing and composition

Create a numbered storyboard with one panel per scene. Show the panels clearly so I can review them and select a specific scene.

The storyboard must visibly show the character and the intended background.

Do not generate individual mouth variations or separate character assets until I select a scene.`,
  },
  {
    id: 'prompt-3',
    step: 3,
    name: 'Prompt 3 — Generate nine full-face mouth variations',
    shortLabel: '3. Face Grid',
    badge: '3×3 Faces',
    icon: <Smile className="w-3.5 h-3.5 text-pink-400" />,
    prompt: `You are a professional 2D cartoon character artist specializing in emotion-matched lip-sync artwork.

I will provide:

1. The selected storyboard panel.
2. The character reference image, if available.
3. The selected scene's exact dialogue and emotion.
4. A separate reference prompt defining the required A–H/X mouth sequence.

First, inspect the storyboard and reference images. The storyboard is the primary reference for face orientation, head angle, expression, and composition. If the orientation is unclear, ask me before generating.

Generate a clean 3×3 grid containing exactly nine full-face variations of the same character.

### Requirements

- Every cell must show the same character, with consistent identity, hairstyle, skin tone, facial proportions, and art style.
- Match the storyboard's exact face orientation and perspective. Do not automatically make the character front-facing.
- Match the scene's emotion. For an angry scene, the mouth shapes must look angry while remaining suitable for speech.
- Keep the eyes, eyebrows, nose, and face consistent with the character and intended emotion.
- Change only the mouth shape between variations, apart from tiny adjustments needed for natural integration.
- Keep the face fully visible and consistently positioned in every cell.
- Use a clean, evenly spaced 3×3 grid with no overlapping cells.
- Do not crop out the mouth yet.
- Do not add a different background or alter the character's identity.

### Additional mouth/lips requirements

- The mouth shapes must match the character's established art style and face orientation.
- Do not draw external skin-coloured lips, fleshy lip borders, lipstick, or additional skin-shaped pieces around the mouth.
- Only the actual cartoon mouth artwork and its necessary internal details, such as teeth, tongue, and dark mouth interior, may be included.
- Do not include skin-coloured patches or face fragments around any mouth shape.
- Every mouth variation must be clearly distinguishable while preserving the established A–H/X mapping.
- Pay special attention to shape F: F must contain ONLY the actual mouth artwork. Do not add external lips, skin-coloured material, or skin fragments around F.
- Apply the same restriction to A, B, C, D, E, G, H, and X. No variation may contain external lips or surrounding skin fragments.

### Mouth sequence

Use the supplied A–H/X reference prompt as the authoritative source for the order and shape definitions. Do not invent, replace, or rearrange the mapping. If I have not supplied the reference yet, ask me to provide it before generating the grid.

This grid is for visual review. I need to judge whether the mouth shapes match the scene's emotion and face orientation.

Generate the full-face grid first, then wait for my approval or requested changes.`,
  },
  {
    id: 'prompt-4',
    step: 4,
    name: 'Prompt 4 — Extract the transparent mouth sprite sheet',
    shortLabel: '4. Sprite Sheet',
    badge: 'Sprite Sheet',
    icon: <Grid className="w-3.5 h-3.5 text-emerald-400" />,
    prompt: `You are a professional 2D cartoon lip-sync sprite artist.

I will provide the approved 3×3 full-face mouth-variation grid from Prompt 3.

Your task is to extract the nine approved mouth shapes and create a separate transparent PNG sprite sheet.

### Requirements

- Extract exactly nine mouth shapes.
- Preserve the approved designs without unnecessary redrawing.
- Arrange them in a clean, evenly spaced 3×3 grid.
- Remove the face, skin, nose, eyes, eyebrows, hair, and all other facial features.
- Remove the original background completely.
- Use genuine alpha transparency everywhere outside the mouth artwork.
- Preserve necessary internal details, such as teeth and tongue.
- Preserve each shape's proportions, outline, expression, and perspective.
- Do not add skin-coloured patches, face fragments, or shadows outside the mouth.
- Keep every shape complete, separate, and uncropped.
- Do not stretch, flip, or rotate shapes in a way that conflicts with the character's face orientation.
- Use the supplied A–H/X reference prompt as the authoritative source for mouth definitions and sequence. Do not change the mapping.
- If labels would interfere with the artwork, leave the artwork unlabelled and provide the grid order separately.

### Additional mouth/lips extraction requirements

- Extract ONLY the actual mouth artwork from each approved variation.
- **Do not extract, reproduce, or include the labels A, B, C, D, E, F, G, H, or X in the final sprite sheet. The letters must not appear anywhere in the exported image.**
- Do not include text, numbers, symbols, label backgrounds, or other annotation elements.
- Remove all external lips, skin-coloured lip borders, skin fragments, and surrounding face pixels.
- Preserve the original mouth contours and internal details without redesigning or changing the established A–H/X mapping.
- Pay special attention to shape F, which must not contain any skin-coloured lips or surrounding skin fragments.
- Apply the same rule to all nine shapes. No sprite may contain external lips or face fragments.
- Do not replace an incorrectly extracted mouth with a newly designed mouth. Preserve the approved shape and correct the extraction instead.
- Maintain the original sequence and grid positions: first row A, B, C; second row D, E, F; third row G, H, X. Use these positions internally to preserve the mapping, but do not display the letters in the final image.

Before presenting the result, verify that there are exactly nine distinct mouth shapes and that the background is truly transparent—not a white or checkerboard pattern baked into the image.

If the extraction cannot preserve the approved mouth designs or orientation, explain the issue rather than silently redesigning them.

### Final output

- One transparent PNG sprite sheet.
- Exactly nine mouth shapes in a clean 3×3 grid.
- No labels, text, letters, or annotations.
- No face, skin, external lips, or background remnants.
- Genuine alpha transparency outside the mouth artwork.`,
  },
  {
    id: 'prompt-5',
    step: 5,
    name: 'Prompt 5 — Generate the 9:16 mouthless character image',
    shortLabel: '5. 9:16 Character',
    badge: '9:16 Vertical',
    icon: <Smartphone className="w-3.5 h-3.5 text-amber-400" />,
    prompt: `You are a professional 2D cartoon character artist preparing a character asset for lip-sync animation.

I will provide:

1. The approved storyboard panel for the selected scene.
2. The character reference image, if available.
3. The approved full-face mouth-variation grid from Prompt 3.

Generate **one clean, full-screen character image with the background, but with no mouth**.

### Aspect ratio — mandatory

- The final image MUST use a **9:16 vertical aspect ratio**, suitable for a portrait video.
- Target resolution: **1080 × 1920 pixels**, or the closest available resolution with the exact 9:16 ratio.
- Compose the character and background specifically for a vertical canvas.
- Do not produce a square, landscape, or horizontal image.
- Do not achieve the ratio by simply cropping off the character's hands, head, or body.
- If adapting the storyboard's composition is necessary, extend or recompose the background while preserving the character's intended pose and appearance.

### Match the storyboard

- Preserve the character's identity, art style, skin tone, hairstyle, clothing, proportions, and body design.
- Match the selected storyboard scene's face orientation, head angle, gaze, pose, hand gestures, and body posture.
- Keep exactly ONE character in the entire scene.
- The character must fill most of the vertical screen, with the hands, arms, and posture visible as specified by the storyboard.
- Reproduce the intended background and overall composition, adapted naturally to 9:16.
- Maintain the same character appearance as the approved face variations.

### Mouth-removal requirements

- Remove the entire mouth, including lips, dark mouth interior, teeth, and tongue.
- Reconstruct the area naturally using the surrounding skin or face artwork.
- Keep the nose, eyes, eyebrows, cheeks, chin, and all other facial features intact.
- Do not leave a blank white patch, blur, smudge, scar, or obvious editing mark where the mouth was.
- Do not add a replacement line, neutral mouth, or closed-mouth symbol.
- Do not change the emotion expressed by the eyes, eyebrows, or body language.

### Additional mouth/lips restrictions

- The character must have absolutely NO MOUTH AND NO LIPS.
- Do not draw any lip outline, skin-coloured lips, smile line, frown line, mouth-shaped mark, or replacement mouth.
- Do not leave any lip-like shape or skin-coloured patch where the mouth was.
- Reconstruct the lower face naturally so that it looks like a clean, originally mouthless illustration rather than an edited face.
- If any phone screen, photograph, mirror, reflection, or other visible surface contains a depiction of the character, that depiction must also have no mouth or lips.
- Do not modify the character's eyes, eyebrows, nose, head angle, expression, or pose to compensate for the missing mouth.

### Output requirements

- Produce one high-resolution 9:16 vertical image.
- Keep the entire image portrait-oriented, including the background.
- Keep the background intact and consistent with the selected scene.
- Do not include a grid, labels, multiple versions, or additional characters.
- Do not generate a separate transparent background; this image must retain its scene background.

This image will be used as the base character layer in my lip-sync website. The mouth will be added separately using the approved sprite sheet, so the mouth area must be clean and suitable for animation.

If the supplied references conflict or the intended orientation is unclear, ask me before generating.`,
  },
];

export const PromptModal: React.FC = () => {
  const { isPromptModalOpen, setPromptModalOpen } = useEditorStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('prompt-1');

  if (!isPromptModalOpen) return null;

  const handleCopy = async (item: WorkflowPrompt) => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      setCopiedId(item.id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2500);
    } catch (e) {
      console.warn('Failed to copy prompt to clipboard:', e);
    }
  };

  const selectedPrompt = WORKFLOW_PROMPTS.find((p) => p.id === selectedPromptId) || WORKFLOW_PROMPTS[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      {/* Modal with fixed, contained height — never increases in size */}
      <div className="w-full max-w-2xl h-[580px] max-h-[88vh] bg-editor-elevated border border-editor-border rounded-editor-xl shadow-modal flex flex-col overflow-hidden text-xs text-editor-text">
        {/* Header */}
        <div className="h-12 border-b border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-editor-sm bg-editor-accent/15 border border-editor-accent/30 flex items-center justify-center text-editor-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-editor-text">Cartoon Animation Workflow Prompts</h2>
              <p className="text-[10px] text-editor-muted leading-tight">
                Click any step to copy prompt to your clipboard
              </p>
            </div>
          </div>
          <button
            onClick={() => setPromptModalOpen(false)}
            className="w-7 h-7 rounded-editor-sm flex items-center justify-center hover:bg-editor-hover text-editor-muted hover:text-editor-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 5 Step Buttons (Compact Row) */}
        <div className="p-3 bg-editor-panel border-b border-editor-border shrink-0">
          <div className="grid grid-cols-5 gap-1.5">
            {WORKFLOW_PROMPTS.map((item) => {
              const isCopied = copiedId === item.id;
              const isSelected = selectedPromptId === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedPromptId(item.id);
                    handleCopy(item);
                  }}
                  className={`p-2 rounded-editor-md border text-left flex flex-col justify-between transition-all group relative ${
                    isCopied
                      ? 'border-editor-success bg-editor-success/15 shadow-sm'
                      : isSelected
                      ? 'border-editor-accent bg-editor-accent/15 text-white shadow-sm ring-1 ring-editor-accent/40'
                      : 'border-editor-border bg-editor-surface hover:border-editor-accent/40 hover:bg-editor-hover'
                  }`}
                  title={`Click to select & copy ${item.name}`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <div className="w-5 h-5 rounded bg-editor-panel border border-editor-border/60 flex items-center justify-center shrink-0">
                      {item.icon}
                    </div>
                    {isCopied ? (
                      <Check className="w-3.5 h-3.5 text-editor-success shrink-0" />
                    ) : (
                      <span className="text-[9px] font-mono font-medium text-editor-muted">
                        P{item.step}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-[11px] truncate text-editor-text group-hover:text-white transition-colors">
                      {item.shortLabel}
                    </p>
                    <p className="text-[9px] font-mono text-editor-muted truncate">
                      {isCopied ? 'Copied!' : item.badge}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Prompt Preview with Dedicated Scrollbar — size does not expand */}
        <div className="flex-1 min-h-0 flex flex-col p-3.5 space-y-2 overflow-hidden bg-editor-elevated">
          {/* Action Bar */}
          <div className="flex items-center justify-between pb-1.5 border-b border-editor-border/60 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-xs text-editor-text">{selectedPrompt.name}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-editor-panel text-editor-accent border border-editor-accent/30">
                {selectedPrompt.badge}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(selectedPrompt)}
              className={`px-3 py-1 rounded-editor-sm font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-sm ${
                copiedId === selectedPrompt.id
                  ? 'bg-editor-success text-white'
                  : 'bg-editor-accentAction hover:bg-editor-accent text-white active:scale-95'
              }`}
            >
              {copiedId === selectedPrompt.id ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Prompt</span>
                </>
              )}
            </button>
          </div>

          {/* Internal Scroller Box — Scrollable without growing the modal */}
          <div className="flex-1 min-h-0 bg-editor-surface border border-editor-border rounded-editor-md p-3 overflow-y-auto">
            <pre className="font-mono text-[11px] text-editor-secondary leading-relaxed whitespace-pre-wrap select-text">
              {selectedPrompt.prompt}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 border-t border-editor-border px-4 flex items-center justify-between bg-editor-panel shrink-0">
          <span className="text-[11px] text-editor-muted truncate">
            {copiedId ? '✓ Prompt copied to clipboard! Paste into your AI tool.' : 'Tip: Clicking any prompt button instantly copies it to your clipboard.'}
          </span>
          <button
            onClick={() => setPromptModalOpen(false)}
            className="px-3 py-1 rounded-editor-sm hover:bg-editor-hover border border-editor-border text-editor-secondary hover:text-editor-text font-medium transition-colors shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
