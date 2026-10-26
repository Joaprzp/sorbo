type Pagina = { isDone: boolean; continueCursor: string };

// Recorre una consulta paginada desde una acción, página por página, hasta
// el final. Las consultas de una sola vez pasarían el límite de lecturas.
export async function recorrerPaginas<P extends Pagina>(
  pedir: (cursor: string | null) => Promise<P>,
  cada: (pagina: P) => Promise<void>,
): Promise<void> {
  let cursor: string | null = null;
  for (;;) {
    const p = await pedir(cursor);
    await cada(p);
    if (p.isDone) return;
    cursor = p.continueCursor;
  }
}
