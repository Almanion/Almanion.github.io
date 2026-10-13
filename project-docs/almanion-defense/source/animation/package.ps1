$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$outDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$zipPath = Join-Path (Split-Path $outDir -Parent) 'Almanion-анимация.zip'
$report = Get-Content -LiteralPath (Join-Path $outDir 'evidence-v2/verification.json') -Raw | ConvertFrom-Json
$htmlHash = (Get-FileHash -LiteralPath (Join-Path $outDir 'Almanion.html') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($report.htmlSha256 -ne $htmlHash) { throw 'Verification must match the current HTML build.' }
foreach ($extraReport in @('reading-verification.json','opening-verification.json','flight-verification.json','cursor-verification.json','search-theme-verification.json','star-volume-verification.json','fsrs-navigation-verification.json','first-five-verification.json','account-verification.json')) {
    $extra = Get-Content -LiteralPath (Join-Path $outDir "evidence-v2/$extraReport") -Raw | ConvertFrom-Json
    if ($extra.htmlSha256 -ne $htmlHash) { throw "Verification does not match current HTML: $extraReport" }
}
$reportText = @"
ПРОВЕРКА НЕПРЕРЫВНОЙ АНИМАЦИИ ALMANION

Версия исходников: f7f708a3b7266700b8a9ce2df9070e681e875654
HTML SHA-256: $htmlHash

Полный маршрут и эффекты проверены на этой итоговой HTML-сборке.
Дополнительно проверены разгон и торможение звёзд во время влёта,
обратный переход, чистая остановка и панель управления.

Автоматизированные проверки в Microsoft Edge (Playwright):
— 33 состояния от 0 до 32, весь маршрут вперёд;
— переработанный блок FSRS‑6: формулы, графики, счётчики и отсутствие наложений;
— реальная sessionTransition(): «Снова» → 2 → 1 → 0, S и D при подтверждениях неизменны;
— универсальные влёты и вылеты: быстрый доступ, главная, финал и оглавление;
— восемь маршрутов в обе стороны, направление глубины, разгон и торможение;
— регистрация: настоящие формы, синтетический профиль и схема синхронизации;
— маршрут из 33 остановок, включая аккаунт, возврат, повтор и оглавление;
— первые две сцены: композиция, переход и восстановление;
— раскрытие светлой страницы физики внутри увеличивающейся карточки;
— перенос заголовка карточки в заголовок страницы без наложения страниц;
— разгон и торможение звёзд, связанных с движением камеры;
— обратный вылет из физики к исходной карточке;
— родной звёздный фон главной, его видимость в автономном окне;
— 28 расходящихся звёзд на каждое демонстрационное нажатие;
— экраны 3–4: читаемое оглавление, сворачивание меню, прокрутка к формуле;
— обратное раскрытие оглавления, повтор и точное восстановление состояний;
— восстановление всех предыдущих состояний;
— повтор каждого перехода;
— сравнение страницы, темы, прокрутки, координат курсора и камеры,
  формул и графика после перехода с анимацией и без неё;
— размеры окна 1920 × 1080 и 1366 × 768;
— отсутствие выхода панели пояснений за отведённую область;
— неподвижные остановки, без работающих анимаций;
— попадание демонстрационного курсора в видимые цели;
— поиск «погрешности»: 3 результата, переход к разделу 2.2 другой главы;
— плавная смена темы в обе стороны, включая color(srgb), тени и границы;
— удержание клавиш, двойной клик, переход через оглавление;
— полноэкранный режим;
— независимость альтернативных оценок от текущей сцены;
— четыре перспективных слоя звёзд с разными скоростями;
— точное восстановление неподвижного неба каждой из 33 остановок;
— совпадение обратного маршрута, отсутствие зависимости от частоты кадров;
— PNG RGBA 1024 × 1024 с прозрачными и полупрозрачными пикселями;
— мягкое сжатие и усиление ореола при нажатии курсора,
  неподвижность на остановках, восстановление фона при возврате;
— запуск с отключённой сетью: внешних HTTP-запросов нет;
— ошибок JavaScript нет.

Числовой пример проверен настоящим knowledge-check.js и ts-fsrs:
S′ = 32,02672948; D′ = 4,99022837; назначенный интервал 32 дня.
Контрольные точки графика на 0, 5, 10, 20, 30 днях совпадают
с заданными значениями с точностью лучше 0,000001 процентного пункта.

Визуально просмотрены ключевые состояния: главная, оглавление,
формула pV = νRT, поиск, настройки, быстрый доступ, раскрытие панели,
карточка, математический разбор, сравнение кривых и узкая страница.
Полный машинный отчёт и длительности переходов —
evidence-v2/verification.json. Проверка влёта — flight-verification.json,
проверка экранов 3–4 и новых эффектов — reading-verification.json
в той же папке. Примеры изображений — в evidence-v2/.

Проверялась готовая локальная HTML-сборка. Физический школьный проектор
не подключался; перед защитой желательно проверить размер окна и F11.
Встроенный браузер приложения не разрешил автоматически обновить file://
вкладку. Если в ней остался прежний вариант, обновите её вручную Ctrl+R.
"@
Set-Content -LiteralPath (Join-Path $outDir 'Проверка.txt') -Value $reportText -Encoding UTF8
$relativeFiles = @('Almanion.html','Заметки-выступающего.html','Запуск-и-управление.txt','Проверенные-источники.txt','Проверка.txt','Числовой-пример.json','manifest.json','cursor-codex-reference.png','cursor-codex-reference.svg','evidence-v2/cursor-reference-comparison.png','evidence-v2/cursor-verification.json','evidence-v2/verification.json')
foreach ($sub in @('source/animation','source/reference')) {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $outDir $sub) -File) {
        $relativeFiles += "$sub/$($file.Name)"
    }
}
foreach ($num in @('00','08','15','23','28')) { $relativeFiles += "evidence-v2/state-$num.png" }
$relativeFiles += 'evidence-v2/fsrs-navigation-verification.json'
$relativeFiles += 'evidence-v2/first-five-verification.json'
$relativeFiles += 'evidence-v2/account-verification.json'
foreach ($step in @(30,31,32)) { $relativeFiles += "evidence-v2/account-$step-1920.png" }
foreach ($step in @(1,2,3,4,5)) { $relativeFiles += "evidence-v2/guided-$step-stop-1920.png" }
foreach ($num in @('19','20','22','23','24','25','26','27')) { $relativeFiles += "evidence-v2/fsrs-$num-1920.png" }
$relativeFiles += 'evidence-v2/navigation-13-14.png'
$relativeFiles += 'evidence-v2/navigation-9-10.png'
$relativeFiles += 'evidence-v2/space-click-1920.png'
$relativeFiles += 'evidence-v2/space-panel-1920.png'
$relativeFiles += 'evidence-v2/opening-verification.json'
$relativeFiles += 'evidence-v2/opening-1-1920.png'
$relativeFiles += 'evidence-v2/opening-2-1920.png'
$relativeFiles += 'evidence-v2/opening-flight-1920.png'
$relativeFiles += 'evidence-v2/flight-verification.json'
$relativeFiles += 'evidence-v2/flight-ready.png'
$relativeFiles += 'evidence-v2/flight-43.png'
$relativeFiles += 'evidence-v2/flight-arrival.png'
$relativeFiles += 'evidence-v2/reading-verification.json'
$relativeFiles += 'evidence-v2/home-stars-restored.png'
$relativeFiles += 'evidence-v2/stellar-click.png'
$relativeFiles += 'evidence-v2/reading-3-1920.png'
$relativeFiles += 'evidence-v2/reading-4-1920.png'
$relativeFiles += 'evidence-v2/reading-3-1366.png'
$relativeFiles += 'evidence-v2/reading-4-1366.png'
$relativeFiles += 'evidence-v2/live-home-stars.json'
$relativeFiles += 'evidence-v2/reading-collapse.png'
$relativeFiles += 'evidence-v2/reading-scroll.png'
$relativeFiles += 'evidence-v2/search-theme-verification.json'
$relativeFiles += 'evidence-v2/search-source.json'
foreach ($name in @('search-other-section','search-destination','theme-light','theme-dark','theme-dark-mid','theme-light-mid')) {
    foreach ($width in @(1920,1366)) { $relativeFiles += "evidence-v2/$name-$width.png" }
}
$relativeFiles += 'Starfield-research.txt'
$relativeFiles += 'README.md'
$relativeFiles += 'Performance.md'
$relativeFiles += 'evidence-v2/performance-before.json'
$relativeFiles += 'evidence-v2/performance-after.json'
$relativeFiles += 'evidence-v2/star-volume-verification.json'
foreach ($phase in @(22,44,65,88)) { $relativeFiles += "evidence-v2/depth-flight-$phase.png" }
$relativeFiles += 'evidence-v2/depth-arrival-1366.png'
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($rel in $relativeFiles) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $outDir $rel),"Almanion/$rel",[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose(); $stream.Dispose() }
$check = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($check.Entries.Count -ne $relativeFiles.Count) { throw 'ZIP file count mismatch.' }
    $entry = $check.GetEntry('Almanion/Almanion.html')
    $entryStream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $zippedHash = [BitConverter]::ToString($sha.ComputeHash($entryStream)).Replace('-', '').ToLowerInvariant() }
    finally { $entryStream.Dispose(); $sha.Dispose() }
    if ($zippedHash -ne $htmlHash) { throw 'ZIP HTML hash mismatch.' }
    Write-Output "Verified ZIP: $($check.Entries.Count) files; HTML hash matches."
} finally { $check.Dispose() }
Get-Item -LiteralPath $zipPath | Select-Object FullName,Length
