import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useGeneration } from '@/hooks/useGeneration'
import { MODELS, useGenerationModel } from '@/preferences/generationModel'
import { useReadingFont } from '@/preferences/readingFont'
import { useReadingFontSize } from '@/preferences/readingFontSize'
import { GenerateReader } from '../worlds/generate/GenerateScreen'

const GENERATION_TEMPERATURE = 1
const USE_THINKING = false

// A creator center test run, /worlds/:id/edit/scenes/:sceneId/test: the author plays the scene as the
// world's draft has it (the editor saves before coming here), against the draft of the world and
// of the scene's collection (draft: true), with Expand and Continue as a reader has them. Scratch
// only — nothing is saved, and Done goes back to the editor.
export default function CreatorTestScreen() {
  const { id, sceneId } = useParams<{ id: string; sceneId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const model = useGenerationModel()
  const readingFont = useReadingFont()
  const readingFontSize = useReadingFontSize()
  const backHref = `/worlds/${id}/edit/scenes/${sceneId}`

  const {
    phase,
    output,
    error,
    errorDetail,
    notice,
    provider,
    displayComplete,
    generate,
    expand,
    continueStory,
    regenerate,
    stop,
  } = useGeneration({ worldId: id })

  const input = { sceneId, model, temperature: GENERATION_TEMPERATURE, useThinking: USE_THINKING, draft: true }

  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    generate(input)
    // Reset on cleanup so StrictMode's mount→unmount→mount re-issues the run (see GenerateScreen).
    return () => {
      startedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleExit() {
    stop()
    // Back to the editor it came from; opened directly (a reload), there is no such entry.
    if (location.key !== 'default') navigate(-1)
    else navigate(backHref, { replace: true })
  }

  return (
    <GenerateReader
      output={output}
      phase={phase}
      displayComplete={displayComplete}
      provider={provider}
      modelLabel={MODELS.find(m => m.id === model)?.label ?? model}
      seedProvider=""
      seedModelLabel=""
      error={error}
      errorDetail={errorDetail}
      notice={notice}
      readingFont={readingFont}
      readingFontSize={readingFontSize}
      mode="generate"
      initialText=""
      initialStructure={null}
      initialParagraphIndex={null}
      onExit={handleExit}
      onExpand={(priorText, direction) => expand({ ...input, priorText, direction })}
      onContinue={(priorText, direction) => continueStory({ ...input, priorText, direction })}
      onRegenerate={(priorText, direction) => regenerate({ ...input, priorText, direction })}
    />
  )
}
