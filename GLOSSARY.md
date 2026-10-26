# Sorbo

Landing de sorbolabs.com. Sorbo es un laboratorio de café de especialidad en Salta, Argentina. Este glosario baja al lenguaje del repo lo que el Manual de Marca v2.1 ya decidió; cuando el manual y el código discrepen, manda el manual.

## Language

### Identidad

**Sorbo**:
La marca y el local. En el logotipo va en minúscula («sorbo», con bajada «LABORATORIO DE CAFÉ»); en headers de pieza va «SORBO» en mayúsculas.

**Pieza**:
Cualquier unidad de comunicación de la marca: story, feed, ficha, menú, y — a definir en este repo — la página web. Regla madre: una sola idea por pieza, todo alineado a la izquierda, todo plano.

**Doe**:
El isotipo. La figura que observa, prueba y ajusta. Uno por pieza como máximo, en color plano (blanco o azul), apoyado sobre una línea o alineado al margen izquierdo. No es obligatorio: se usa cuando la pieza necesita calidez. Es el único elemento que puede convivir con Gluten.

**Banda**:
Zona de color plano adyacente a una foto, donde vive el texto. La partición foto/banda es el único modo válido de combinar imagen y texto: nunca texto sobre foto.

### Paleta (cuatro colores activos)

**Azul Sorbo** `#0D34E9`:
Fondo dominante. Al menos 7 de cada 10 piezas.

**Noche** `#00072C`:
Fondo alterno para piezas técnicas (fichas, lotes, LAB-) y color de texto sobre fondos claros.

**Nieve** `#FBFBFA`:
Fondo de lectura larga: documentos, menú, todo lo que se lee más de diez segundos.

**Bruma** `#DCE0F2`:
Superficies y bloques de color dentro de una pieza. Nunca fondo de página de texto, nunca color de texto.
_Avoid_: Profundo `#03279F` — retirado del sistema en v2.1, sin combinaciones válidas.

### Tipografía

**Archivo**:
Títulos y texto corrido (400–700). Titulares siempre Archivo 700, tracking 0, mayúsculas, alineados a la izquierda.

**Geist Mono**:
Datos y fichas (400–500). Mayúsculas, tracking 0.16em, opacidad 70 %.

**Gluten**:
Restringida al logotipo y al entorno de Doe. Nunca en texto componible.
_Avoid_: Objektiv mk1 — retirada del sistema en v2.1.

### Series

**SESSION NN**:
Encuentros abiertos al público. Geist Mono, mayúsculas, dos dígitos con cero adelante, espacio («SESSION 01»). Número correlativo, no se reinicia por año.

**LAB-NNN**:
Lotes, pruebas, recetas y documentos internos. Con guion («LAB-001»). Sólo se muestra donde aporta dato: fichas técnicas, packaging.

### Operación

**Lista de espera**:
El mecanismo de registro previo a la apertura del local. Quien se anota recibe aviso cuando Sorbo abre o cuando hay un SESSION. En la landing es el cierre de la pieza y la única acción del visitante.

**Campaña**:
La recaudación abierta para financiar una sucursal nueva. La primera y única definida hoy es la de Jujuy; cada ciudad futura tendría su propia campaña y su propia pieza. No tiene fecha de cierre: queda abierta hasta llegar a la meta.

**Contribución**:
Un aporte de dinero real a la campaña. Puede ser anónima o llevar el email del contribuyente; con email, vuelve en café (ver **Recompensa**). Pasa por estados según el cobro: pendiente (promesa o pago diferido), expirada (el intento de cobro murió sin dinero — un pago tardío verificado igual acredita), aprobada (dinero acreditado — la única que suma a la meta) y devuelta. Dos caminos de cobro: Mercado Pago (dinero en cuenta en pesos) y cripto (USDC/USDT en Base, Polygon, Ethereum, Optimism, BNB Chain, Celo y Monad — una sola address EVM — contado a cotización MEP del momento de la acreditación). Mínimo equivalente a un latte: 5.000 ARS o 5 USDC; lo que llega por debajo o por una red no soportada no cuenta.

**Devolución automática**:
La promesa de la campaña: si una contribución aprobada cumple 89 días y la meta todavía no se completó, ese dinero vuelve solo. Cada contribución corre su propio reloj desde la acreditación; lo devuelto se descuenta del recaudado. Una vez cumplida la meta, no hay más devoluciones. Excepción declarada: las contribuciones en cripto no tienen devolución — la pieza lo dice antes del QR.

**Meta**:
El objetivo bruto en pesos de la campaña, elegido ya descontando el costo del cobro. Se muestra públicamente junto al recaudado y al número de contribuyentes. Completarla es un latch: una vez cumplida, la campaña se considera cumplida para siempre.

**Presupuesto**:
El desglose público de la meta por rubro (local, obra, salón, equipamiento, habilitaciones, apertura, tres meses de operación, imprevistos y costo del cobro). Vive en su propia pieza, `/jujuy/numeros`, y suma exactamente la meta.

**Contribuyente**:
Quien hace una contribución. Anónimo por defecto; si deja su email recibe novedades de la campaña — acreditación, devolución, meta cumplida, apertura — y su recompensa. Distinto de la lista de espera: son intenciones distintas y no se mezclan.

**Recompensa**:
Los cafés que devuelve un aporte con email (ADR-0008): $5.000 da 1 café y cada $10.000 más suma 1, con tope de 10 por persona. Se calcula por email sobre la suma de sus aportes aprobados, así que una devolución la baja sola. Un aporte cripto cuenta solo si el aviso con email se dejó antes del pago: el hash es público y cualquiera podría reclamar una transfer ajena. Todos los cafés de la carta, durante los 6 meses siguientes a la **Apertura**. Nada más: sin eventos ni nombres en la pared.
_Avoid_: tier, premio, beneficio.

**Saldo**:
Los cafés que le quedan a una persona: los que da su recompensa menos sus canjes. No se guarda; se calcula. Estados: reservado (meta sin cumplir), confirmado (meta cumplida, sin apertura), activo, vencido y anulado (sus aportes se devolvieron).

**Código**:
El derecho al saldo, al portador y transferible: `JUJ-` y seis caracteres sin ambiguos, más un QR que lleva a `/canje/<id>`. Una persona, un código, aunque aporte varias veces. El código corto solo se busca desde la sesión del staff.

**Canje**:
Cada vez que el staff descuenta cafés de un saldo desde `/canje/<id>`, con la sesión de PIN del dispositivo (`/staff`). De 1 al saldo por vez, con deshacer por 5 minutos. Solo después de la apertura.

**Apertura**:
La fecha en que abre Sorbo Jujuy; se fija a mano (`fijarApertura`) y solo con la meta cumplida. Habilita el canje y fija el vencimiento: apertura + 6 meses.

### Voz

**Especialidad sin careta**:
Posicionamiento. Calidad silenciosa: se muestra el dato (origen, tueste, cupo, horario) y se deja que hable. Sin superlativos, sin adjetivos apilados.

**Voseo seco**:
Tono escrito. Voseo rioplatense declarativo e impersonal. Sin emoji en ninguna superficie.
