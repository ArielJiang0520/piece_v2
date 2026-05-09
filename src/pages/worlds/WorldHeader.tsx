import WorldTabs, { type WorldTab } from './WorldTabs'

interface Props {
  active: WorldTab
  name: string
  worldId: string | number | undefined
}

export default function WorldHeader({ active, name, worldId }: Props) {
  return (
    <header>
      {/* <h1 className="t- display min-w-0">{name}</h1> */}
      <WorldTabs active={active} worldId={worldId} />
    </header>
  )
}
