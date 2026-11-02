import { useState } from 'react'
import { call } from '../bridge'
import { openSupportPage } from '../useHostStatus'
import { Button, Group, Note, Panel, Row } from '../room/parts'
import { GLOW, useScreenAt } from '../room/screen'
import type { PageProps } from './page'

/**
 * Eucatur Play: the Comunidade Eucatur's page. Installs or updates the Ponte Eucatur, the telemetry plugin and
 * the Stream Deck plugin with the Instalador Eucatur that comes with Eucatur Play, opens the community's site,
 * and gives the credits: Eucatur Play is a modified WestPlay (GPL-3.0), whose maker can be supported too. On the
 * room's screen, Home.
 */
export function Support({ cw }: PageProps) {
  const w = cw.support
  useScreenAt('home', GLOW.home, null)
  const [install, setInstall] = useState<'idle' | 'started' | string>('idle')

  const runInstaller = () => {
    call<void>('eucatur_install').then(
      () => setInstall('started'),
      (error: unknown) => setInstall(typeof error === 'string' ? error : 'Não deu para abrir o Instalador Eucatur.'),
    )
  }

  return (
    <Panel
      place="page"
      title={w.title}
      sub={w.sub}
      action={
        <Button glass onClick={() => void openSupportPage()}>
          {w.button}
        </Button>
      }
    >
      <Group title="Ponte, telemetria e Stream Deck" place={4}>
        <Row
          title="Instalar ou atualizar"
          detail="Ponte Eucatur, plugin de telemetria do jogo e plugin do Stream Deck, pelo Instalador Eucatur que vem com o Eucatur Play."
          value="Abrir"
          link
          onClick={runInstaller}
        />
      </Group>
      {install === 'started' && (
        <Note tone="calm">O Instalador Eucatur abriu. Na primeira vez ele pede o código do painel (Meu caminhão).</Note>
      )}
      {install !== 'idle' && install !== 'started' && <Note tone="bad">{install}</Note>}
      <Group title="Créditos" place={5}>
        <Row title="Eucatur Play" detail="Feito pela Comunidade Eucatur para os motoristas da comunidade." />
        <Row
          title="Baseado no WestPlay"
          detail="Criado por Enes (github.com/enes-less/WestPlay). Software livre sob a licença GPL-3.0: o código do Eucatur Play também é aberto, em github.com/2910ale/eucatur-play."
          value="Apoiar o criador"
          link
          onClick={() => void call<void>('open_westplay_support_page')}
        />
      </Group>
      <Note tone="calm">{w.note}</Note>
    </Panel>
  )
}
