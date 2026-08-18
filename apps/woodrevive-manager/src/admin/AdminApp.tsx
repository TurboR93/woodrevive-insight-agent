import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import AdminLayout from './components/AdminLayout'

import PanoramicaPage from './pages/PanoramicaPage'

import ClientiPage from './pages/ClientiPage'
import ClienteDettaglioPage from './pages/ClienteDettaglioPage'
import FornitoriPage from './pages/FornitoriPage'
import ListinoPage from './pages/ListinoPage'

import LottiPage from './pages/LottiPage'
import LottoDettaglioPage from './pages/LottoDettaglioPage'
import ArticoliPage from './pages/ArticoliPage'
import MovimentiPage from './pages/MovimentiPage'

import PreventiviPage from './pages/PreventiviPage'
import PreventivoNuovoPage from './pages/PreventivoNuovoPage'
import PreventivoDettaglioPage from './pages/PreventivoDettaglioPage'
import OrdiniPage from './pages/OrdiniPage'
import OrdineDettaglioPage from './pages/OrdineDettaglioPage'
import DdtPage from './pages/DdtPage'
import DdtDettaglioPage from './pages/DdtDettaglioPage'
import IncassiPage from './pages/IncassiPage'

import AcquistiPage from './pages/AcquistiPage'
import AcquistoNuovoPage from './pages/AcquistoNuovoPage'
import AcquistoDettaglioPage from './pages/AcquistoDettaglioPage'
import SchedeLavorazionePage from './pages/SchedeLavorazionePage'
import SchedaLavorazioneNuovaPage from './pages/SchedaLavorazioneNuovaPage'
import SchedaLavorazioneDettaglioPage from './pages/SchedaLavorazioneDettaglioPage'

import ImpostazioniPage from './pages/ImpostazioniPage'

/**
 * Router del pannello. Piatto, con un unico layout annidato.
 *
 * Le pagine di dettaglio sono rotte a sé (`/lotti/:id`) e non stati interni
 * della lista: così una scheda lotto o un preventivo si possono linkare e
 * mandare a qualcuno. È la ragione per cui non usiamo modali per i dettagli.
 *
 * `/fornitori/:id` e `/articoli/:id` non hanno una pagina propria — le loro
 * informazioni stanno già nella lista — e reindirizzano all'elenco invece di
 * lasciare una rotta morta.
 *
 * Le rotte seguono il mestiere: si compra (acquisti), si tiene in magazzino,
 * si vende e si incassa. Nessuna lavorazione in mezzo — Wood Revive rivende
 * legno antico già lavorato. La «scheda lavorazione» non fa eccezione: è la
 * specifica d'acquisto verso il fornitore, e per questo sta fra gli acquisti.
 *
 * `/preventivi/nuovo` è la creazione rapida: una schermata sola invece di
 * modale-poi-dettaglio. Accetta `?cliente=<id>` per arrivarci dalla scheda
 * cliente con il cliente già scelto — querystring e non stato del router, così
 * il link resta condivisibile come tutte le altre rotte di dettaglio.
 *
 * **Non esiste, e non deve esistere, una rotta per creare un ordine da zero.**
 * Ogni ordine nasce da un preventivo accettato, tramite «Converti in ordine».
 */
export default function AdminApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<PanoramicaPage />} />

          {/* Anagrafiche */}
          <Route path="/clienti" element={<ClientiPage />} />
          <Route path="/clienti/:id" element={<ClienteDettaglioPage />} />
          <Route path="/fornitori" element={<FornitoriPage />} />
          <Route path="/fornitori/:id" element={<Navigate to="/fornitori" replace />} />
          <Route path="/listino" element={<ListinoPage />} />

          {/* Acquisti */}
          <Route path="/acquisti" element={<AcquistiPage />} />
          {/* Carico merce: il camion è arrivato e l'ordine spesso non è mai
              stato scritto. Una schermata sola che crea l'acquisto e registra
              la ricezione insieme. Come `/preventivi/nuovo`, sta prima della
              rotta con parametro per leggibilità. */}
          <Route path="/acquisti/nuovo" element={<AcquistoNuovoPage />} />
          <Route path="/acquisti/:id" element={<AcquistoDettaglioPage />} />
          {/* La specifica verso il fornitore. Accetta `?ordine=` e `?articolo=`
              per la precompilazione: querystring, come `/preventivi/nuovo`. */}
          <Route path="/schede-lavorazione" element={<SchedeLavorazionePage />} />
          <Route path="/schede-lavorazione/nuova" element={<SchedaLavorazioneNuovaPage />} />
          <Route path="/schede-lavorazione/:id" element={<SchedaLavorazioneDettaglioPage />} />

          {/* Magazzino */}
          <Route path="/lotti" element={<LottiPage />} />
          <Route path="/lotti/:id" element={<LottoDettaglioPage />} />
          <Route path="/articoli" element={<ArticoliPage />} />
          <Route path="/articoli/:id" element={<Navigate to="/articoli" replace />} />
          <Route path="/movimenti" element={<MovimentiPage />} />

          {/* Vendite */}
          <Route path="/preventivi" element={<PreventiviPage />} />
          {/* Creazione rapida: rotta vera e linkabile, non una modale. Sta
              prima di `/preventivi/:id` per leggibilità — il router darebbe
              comunque la precedenza al segmento fisso. */}
          <Route path="/preventivi/nuovo" element={<PreventivoNuovoPage />} />
          <Route path="/preventivi/:id" element={<PreventivoDettaglioPage />} />
          <Route path="/ordini" element={<OrdiniPage />} />
          <Route path="/ordini/:id" element={<OrdineDettaglioPage />} />
          <Route path="/ddt" element={<DdtPage />} />
          <Route path="/ddt/:id" element={<DdtDettaglioPage />} />
          <Route path="/incassi" element={<IncassiPage />} />

          <Route path="/impostazioni" element={<ImpostazioniPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
