# Возможные логические ошибки в GPON (main.js)

## 1. **Пропуск выхода 0 сплиттера при трассировке кабельных выходов**

**Файл:** `main.js`, ок. 6937  
**Функция:** `traceAllFiberPathsFromObject`

Цикл по кабельным выходам начинается с индекса 1:
```javascript
for (var oi = 1; oi < outputConnections.length; oi++) {
```
Выход с индексом 0 никогда не включается в трассировку, если он подключён кабелем.

Для ONU и дочерних сплиттеров цикл идёт с 0:
```javascript
for (var oi2 = 0; oi2 < outputConnections.length; oi2++) {
```

**Исправлено:** цикл изменён на `oi = 0`.

---

## 2. **getFiberUsage не проверяет nodeConnections для sleeve**

**Файл:** `main.js`, 3204–3208  
**Функция:** `getFiberUsage`

Проверка `nodeConnections` выполняется только для cross:
```javascript
const nodeConn = t === 'cross' ? obj.properties.get('nodeConnections') : null;
```

В других местах для sleeve читается `nodeConnections` (5907, 5970), при этом в `createObjectFromData` `nodeConnections` сохраняется только у cross (4619). Sleeve не получает `nodeConnections`, поэтому фактической ошибки нет. Но если позже sleeve начнёт поддерживать nodeConnections, в `getFiberUsage` его нужно будет учитывать.

**Исправлено:** проверка `nodeConnections` выполняется и для cross, и для sleeve; добавлен `exclude.sleeveId` для случая редактирования sleeve.

---

## 3. **getFiberUsage не проверяет incomingFiber у ONU**

**Файл:** `main.js`, 3194–3255  
**Функция:** `getFiberUsage`

Проверяются:
- OLT: `incomingFiber`, `portAssignments`
- Splitter: `inputFiber`, `outputConnections`
- Cross/sleeve: `nodeConnections`, `oltConnections`, `onuConnections`

`incomingFiber` у ONU не проверяется. Сейчас ONU получает жилу только через:
- `onuConnections` у cross/sleeve, или
- подключение к выходу сплиттера (логическое, без cableId/fiberNumber на ONU).

Если в будущем ONU будет иметь собственное `incomingFiber`, дублирование жилы не будет детектироваться в `getFiberUsage`.

**Рекомендация:** добавить проверку ONU с `incomingFiber` для согласованности и защиты от дублирования.

---

## 4. **connectFiberToOnu не устанавливает incomingFiber на ONU**

**Файл:** `main.js`, 8332–8353  
**Функция:** `connectFiberToOnu`

При подключении жилы к ONU выставляется только `onuConnections` на sleeve; `onuObj.properties.set('incomingFiber', ...)` не вызывается. В `showObjectInfo` для ONU используется `onuIncoming` (5137), но он всегда null при подключении через эту функцию.

**Исправлено:** при `connectFiberToOnu` устанавливается `incomingFiber` на ONU; при `disconnectFiberFromOnu` сбрасывается.

---

## 5. **getSplitterRootInputFiber и циклы**

**Файл:** `main.js`, 7947–7968  
**Функция:** `getSplitterRootInputFiber`

Используется `visited` для защиты от циклов. При наличии цикла (A→B→C→A) функция вернёт `null` после входа в цикл. Это корректно, но в цепочке сплиттеров с циклом дочерний сплиттер может остаться без `inputFiber`. В таком случае UI может показывать «Вход не задан» для сплиттера в цикле.

**Рекомендация:** логику считать корректной; при желании — добавить проверку на циклические цепочки и явное предупреждение в UI.

---

## 6. **Разделение exclude в getFiberUsage**

В `getFiberUsage` при `exclude.type === 'splitterInput'` пропускаются сообщения о занятости для OLT (oltConn, portAssignments). Это сделано намеренно: жила может быть одновременно «приход OLT» и «вход сплиттера» (OLT → сплиттер). То же самое для `exclude.type === 'oltPort'` и splitter `inputFiber`. Текущая логика уместна для GPON.

---

## Итог

| # | Критичность | Описание | Статус |
|---|-------------|----------|--------|
| 1 | **Высокая** | Выход 0 сплиттера не включается в трассировку при кабельном подключении | Исправлено |
| 2 | Низкая | Потенциальная несовместимость с nodeConnections для sleeve в будущем | Исправлено |
| 3 | Низкая | Отсутствие проверки incomingFiber у ONU | Исправлено |
| 4 | Средняя | ONU не получает incomingFiber при подключении с муфты | Исправлено |
| 5 | Информационная | Поведение при циклических цепочках сплиттеров | Без изменений |
