import { brandConfig } from './brand.config'

/**
 * Il logo. È l'unico componente che conosce i percorsi dei file in
 * public/brand/ — se un giorno arriva il vettoriale dal cliente, si cambia qui.
 *
 * Non abbiamo l'SVG: sono PNG scaricati dal sito ufficiale, quindi il negativo
 * è un file diverso e non una versione ricolorata.
 */
export function Logo({
  variante = 'negativo',
  className = 'h-8 w-auto',
}: {
  variante?: 'positivo' | 'negativo'
  className?: string
}) {
  if (variante === 'negativo') {
    return (
      <img
        src={brandConfig.logo.negativo}
        srcSet={`${brandConfig.logo.negativo} 1x, ${brandConfig.logo.negativo2x} 2x`}
        alt={brandConfig.nome}
        className={className}
      />
    )
  }
  return <img src={brandConfig.logo.positivo} alt={brandConfig.nome} className={className} />
}

export { brandConfig }
