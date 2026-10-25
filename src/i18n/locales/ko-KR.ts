/**
 * Korean UI copy source of truth.
 * Domain/provider payloads are NOT localized here; only TripPlanner-owned UI text belongs here.
 * Keep product-facing wording in this catalog so a future locale switch does not require component edits.
 */
export const koKR={
  appName:'TripPlanner',

  common:{
    close:'닫기',
    edit:'편집',
    delete:'삭제',
    add:'추가',
    complete:'완료',
    logout:'로그아웃',
    loading:'불러오는 중…',
    save:'저장',
    saving:'저장 중…',
    cancel:'취소',
    apply:'적용',
    reset:'초기화',
    none:'없음',
    optional:'선택',
    minutes:'분',
    hours:'시간',
    place:'장소',
    memo:'메모',
    start:'시작',
    end:'종료',
    departure:'출발',
    arrival:'도착',
    unknownPlace:'알 수 없는 장소',
    viewPlace:'장소 보기',
    undo:'실행 취소',
    redo:'다시 실행',
    currency:'통화',
    id:'아이디',
    password:'비밀번호',
    passwordConfirm:'비밀번호 확인',
    adminId:'관리자 ID',
    newPassword:'새 비밀번호',
    currentTemporaryPassword:'현재/임시 비밀번호',
    change:'변경',
    status:'상태',
    action:'작업',
    noRecords:'기록 없음'
  },

  provider:{
    label:(provider:'GOOGLE'|'NAVER')=>provider==='GOOGLE'?'|Google 지도|':'|NAVER 지도|'
  },

  topbar:{
    backToList:'여행 목록',
    save:'저장',
    saved:'저장됨',
    saving:'저장 중…',
    addSchedule:'일정 추가',
    tripSettings:'여행 설정',
    undo:'실행 취소',
    redo:'다시 실행',
    management:'관리'
  },

  capture:{
    enter:'보기 모드',
    exit:'편집 화면으로',
    subtitle:'여행 일정',
    summary:(visits:number,places:number,transports:number)=>`일정 ${visits} · 장소 ${places} · 주요 이동 ${transports}`,
    previousDay:'이전 날',
    nextDay:'다음 날',
    fullDay:'하루 일정',
    emptyDay:'이 날짜에 등록된 일정이 없습니다.',
    dayPage:(current:number,total:number)=>`${current} / ${total}일`,
    agenda:'일정',
    overview:'일정 요약',
    visitCount:(count:number)=>`방문 ${count}`,
    transportCount:(count:number)=>`주요 이동 ${count}`,
    keyboardHelp:'← → 키로 날짜를 이동할 수 있습니다.',
    scrollCaptureHelp:'전체 페이지 캡처를 사용하면 하루 일정을 한 장으로 저장할 수 있습니다.',
    daySummary:'준비 정보',
    estimatedCost:'예상 비용',
    preparations:'준비물',
    noCost:'등록된 예상 비용이 없습니다.',
    noPreparations:'등록된 준비물이 없습니다.',
    tripSummary:'여행 요약',
    connectionLane:'이동 계획',
    details:'상세 정보',
    detailsHelp:'일정별 예약, 시간표, 티켓 및 준비 정보를 확인할 수 있습니다.',
    noDetails:'등록된 상세 정보가 없습니다.',
    printMapTitle:'지도',
    printMapHelp:'인쇄 및 PDF 저장 시 지도 콘텐츠는 제외됩니다.'
  },

  collaboration:{
    remoteChanges:'다른 사용자가 이 여행을 수정했습니다. 현재 편집 내용은 유지됩니다.',
    reload:'최신 버전 불러오기'
  },

  errors:{
    providerMetadataPartial:(count:number)=>`저장된 장소 ${count}개의 표시 정보를 불러오지 못했습니다. 저장된 위치는 유지됩니다.`,
    tripNotFound:'여행을 찾을 수 없습니다.',
    tripLoadFailed:'여행을 불러오지 못했습니다.',
    tripOpening:'여행을 불러오는 중입니다.',
    tripOpenFailed:'여행을 열 수 없습니다.',
    saveFailed:'저장하지 못했습니다.',
    tripListFailed:'여행 목록을 불러오지 못했습니다.',
    tripCreateFailed:'여행을 만들지 못했습니다.',
    runtimeMapConfigFailed:'지도 설정을 불러오지 못했습니다.',
    authServerFailed:'인증 서버에 연결하지 못했습니다.',
    tripAccessLoadFailed:'여행 접근 설정을 불러오지 못했습니다.',
    tripAccessSaveFailed:'여행 접근 설정을 저장하지 못했습니다.',
    runtimeConfigUnavailable:'설정을 불러올 수 없습니다.',
    serverConnection:'서버 연결 오류',
    adminRequired:'관리자 권한이 필요합니다.',
    routeUnsupported:'현재 지도에서는 선택한 이동수단의 경로를 지원하지 않습니다.',
    routeCoordinatesRequired:'출발지, 도착지 및 경유지의 위치를 확인하세요.',
    routeRefreshRequired:'이동수단 또는 경유지가 변경되었습니다. 경로를 다시 조회한 후 저장하세요.',
    physicalPlaceRequired:'주요 이동의 출발지와 도착지를 지정하세요.'
  },

  tripHome:{
    untitled:'이름 없는 여행',
    title:'여행 계획',
    description:'여행을 선택하거나 새 여행을 만드세요.',
    newTripPlaceholder:'여행 이름',
    createGoogle:'새 여행 만들기',
    creating:'생성 중…',
    createDenied:'새 여행을 만들 권한이 없습니다.',
    listTitle:'내 여행',
    empty:'저장된 여행이 없습니다.',
    revision:(revision:number)=>`저장 버전 ${revision}`,
    checkingAccess:'접근 권한과 지도 설정을 확인하는 중입니다…',
    back:'여행 목록으로',
    delete:'여행 삭제',
    deleting:'삭제 중…',
    deleteConfirm:(name:string)=>`“${name}” 여행을 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.`,
    deleteFailed:'여행을 삭제하지 못했습니다.'
  },

  tripSettings:{
    eyebrow:'TRIP',
    title:'여행 설정',

    mapSection:'지도 표시',
    pathThickness:'경로 두께',
    pathThicknessHelp:'연결선, 자동 경로 및 주요 이동선의 두께를 설정합니다.',
    zoomNote:'여행을 열면 가장 이른 일정의 위치를 먼저 표시합니다.',

    appearanceSection:'표시 스타일',
    planBColor:'PLAN B 색상',
    planBColorHelp:'PLAN B 일정에 사용할 색상을 설정합니다.',
    planBColorReset:'기본 색상으로',

    pinRefreshTitle:'장소 위치 갱신',
    pinRefresh:'위치 갱신',
    pinRefreshing:'갱신 중…',
    pinRefreshHelp:'필요한 경우 저장된 장소의 위치 정보를 다시 조회합니다.',
    pinRefreshConfirm:(count:number)=>`장소 ${count}개의 위치 정보를 다시 조회합니다. 지도 API 요청이 발생할 수 있습니다. 계속하시겠습니까?`,
    pinRefreshNone:'갱신할 장소가 없습니다.',
    pinRefreshResult:(requests:number,failed:number)=>failed?`${requests}개 중 ${failed}개의 위치를 갱신하지 못했습니다.`:`${requests}개의 위치를 갱신했습니다.`,
    pinRefreshFailed:'장소 위치를 갱신하지 못했습니다.',

    accessSection:'접근 사용자',
    accessHelp:'이 여행에 접근할 수 있는 사용자를 설정합니다.',
    open:'모든 활성 사용자',
    restricted:'지정 사용자만',
    restrictedEmpty:'지정된 사용자가 없으면 관리자만 접근할 수 있습니다.',
    adminOnly:'접근 사용자 설정은 관리자만 변경할 수 있습니다.',
    saveAccess:'접근 설정 저장',
    savingAccess:'저장 중…'
  },

  placePicker:{
    place:'장소',
    anywhere:'위치 없음',
    help:'기존 장소를 선택하거나 새 장소를 검색할 수 있습니다.',
    newPlace:'＋ 새 장소 검색 / 입력',
    currentPlace:'현재 장소',
    searchLabel:'장소 · 주소 검색',
    searchPlaceholder:'장소명 또는 주소',
    search:'검색',
    searching:'검색 중…',
    explicitSearchHelp:'검색 버튼을 누르거나 Enter 키를 눌러 검색하세요.',
    queryRequired:'장소명 또는 주소를 입력하세요.',
    noAutocomplete:'검색 제안이 없습니다.',
    noResults:'검색 결과가 없습니다.',
    searchFailed:'장소를 검색하지 못했습니다.',
    detailsFailed:'장소 정보를 불러오지 못했습니다.',
    suggestions:'검색 제안',
    results:'검색 결과',
    placeName:'장소 이름',
    manualPlaceholder:'장소 이름',
    manualCoordinates:'＋ 좌표 직접 입력',
    latitude:'위도',
    longitude:'경도'
  },

  schedule:{
    generic:'일정',
    edit:'일정 편집',
    info:'일정 정보',
    infoHelp:'일정 이름과 장소를 설정합니다.',
    name:'일정 이름',
    memoPlaceholder:'간단한 메모',

    summary:'요약',
    summaryPlaceholder:'일정에 대한 간단한 설명',
    summaryHelp:'일정 카드에 표시됩니다.',

    detailedNotes:'상세 메모',
    detailedNotesPlaceholder:'예약 정보, 시간표, 주의사항 등',
    detailedNotesHelp:'보기 모드의 상세 정보에 표시됩니다.',

    visit:'방문',
    nearby:'주변 후보',
    visitIntent:'방문 목적',
    fixedTemporarilyRemoved:'시간 준수 · 임시 제외',

    planningKind:'계획 유형',
    planningKindHelp:'일정의 용도에 따라 필요한 항목이 표시됩니다.',

    timeCondition:'시간 조건',
    timeConditionHelp:'일정에 적용할 시간 조건을 설정합니다.',
    always:'제한 없음',
    limited:'기간 한정',
    fixed:'시간 지정',
    periodStart:'기간 시작',
    periodEnd:'기간 종료',
    fixedDate:'예약 / 시작 날짜',
    fixedTime:'예약 / 시작 시간',

    availabilityAdd:'＋ 운영시간 / 이용 가능시간 추가',
    availability:'운영시간',
    availabilityHelp:'일정을 배치할 수 있는 시간 범위를 표시합니다.',
    remove:'제거',

    selectPlaceRequired:'장소를 선택하세요.',
    physicalOptional:'장소가 필요하지 않은 일정은 위치 없이 등록할 수 있습니다.',
    titleUsePlace:'비워두면 장소 이름을 사용합니다.',
    titleAnywhereRequired:'위치가 없는 일정은 이름을 입력하세요.',
    currentPlace:(name:string)=>`현재 장소 · ${name}`,

    nearbyNeedsPlace:'주변 후보에는 장소가 필요합니다.',
    titleRequiredWithoutPlace:'위치가 없는 일정은 이름을 입력하세요.',
    dateRangeInvalid:'기간을 확인하세요.',
    fixedDateTimeInvalid:'예약 또는 시작 일시를 확인하세요.',
    availabilityInvalid:'운영시간을 확인하세요.',
    newPlaceNameRequired:'새 장소 이름을 입력하세요.',
    infoInvalid:'일정 정보를 확인하세요.',

    minDuration:(min:number)=>`일정은 최소 ${min}분이어야 합니다.`,
    stayMinDuration:(min:number)=>`체류시간은 ${min}분 이상이어야 합니다.`,
    placementStartInvalid:'시작 일시를 확인하세요.',
    placementEndInvalid:'종료 일시를 확인하세요.',

    placement:'일정 배치',
    placementFixedHelp:'시작 시각은 지정된 시간과 동일하게 적용됩니다.',
    placementHelp:'일정표에서 사용할 시간을 설정합니다.',
    duration:'지속시간',
    endDateTime:'종료 일시',
    startDate:'시작 날짜',
    startTime:'시작 시간',
    endDate:'종료 날짜',
    endTime:'종료 시간',
    stayDuration:'체류시간',

    color:'일정 색상',
    colorHelp:'직접 지정한 색상은 날짜별 기본 색상보다 우선합니다.',
    colorAria:'일정 색상 직접 지정',
    autoDayColor:'날짜별 색상 자동 적용',
    useDayColor:'날짜 색상 사용',
    deleteConfirm:'이 일정을 삭제하시겠습니까? 장소 정보는 유지됩니다.',
    samePlaceSearch:'동일한 장소 검색 기능을 사용합니다.',

    placementPrep:'기본 배치',
    placementPrepHelp:'일정표에 처음 배치할 때 사용할 기본 시간을 설정합니다.',
    emptyDurationHelp:'비워두면 기본 시간이 적용됩니다.',
    placementLength:'기본 시간',
    placementLengthHelp:'일정표에 배치한 후에도 변경할 수 있습니다.',

    properties:'방문 정보',
    propertiesHelp:'일정의 분류와 추가 정보를 설정합니다.',
    visitIcon:'아이콘',
    expectedCost:'예상 비용',
    expectedCostHelp:'이 일정에서 예상되는 비용을 입력합니다.',
    preparations:'준비물',
    preparationsHelp:'한 줄에 하나씩 입력하세요.',
    costInvalid:'예상 비용은 0 이상의 숫자로 입력하세요.',
    currencyInvalid:'통화 코드는 KRW, JPY와 같은 3자리 영문으로 입력하세요.',

    iconLabels:{
      PLACE:'장소',
      ATTRACTION:'명소',
      FOOD:'식사',
      CAFE:'카페',
      SHOPPING:'쇼핑',
      HOTEL:'숙박',
      TRANSIT:'교통',
      EVENT:'행사',
      NATURE:'자연',
      OTHER:'기타'
    }
  },

  attachments:{
    title:'이미지 첨부',
    dropTitle:'이미지를 놓거나 클릭하여 첨부',
    dropHelp:'JPEG · PNG · WebP · 파일당 8MB 이하',
    uploading:'업로드 중…',
    uploadFailed:'이미지를 업로드하지 못했습니다.',
    invalidType:'JPEG, PNG, WebP 이미지만 첨부할 수 있습니다.',
    sizeLimit:'이미지는 파일당 8MB 이하로 첨부하세요.',
    remove:'첨부 이미지 제거'
  },

  base:{
    edit:'거점 편집',
    needsPlace:'거점에는 장소가 필요합니다.',
    placeHelp:'거점으로 사용할 장소를 선택하세요.',
    info:'거점 정보',
    infoHelp:'거점은 일정표에 여러 번 배치할 수 있습니다.',
    createInfoHelp:'반복해서 사용할 거점을 등록합니다.',
    displayName:'표시 이름',
    defaultDuration:'기본 체류시간',
    deleteConfirm:'이 거점을 삭제하시겠습니까? 장소 정보와 이미 배치된 일정은 유지됩니다.',
    meta:'거점 · 반복 배치 가능',
    returnDetail:'거점은 그대로 유지됩니다.'
  },

  createSchedule:{
    eyebrow:'PLANNING',
    title:'일정 추가',
    placeTab:'장소 · 일정',
    transportTab:'주요 이동',
    purposeTitle:'일정 유형',
    purposeHelp:'추가할 일정의 유형을 선택하세요.',
    basePlaceHelp:'거점으로 사용할 장소를 선택하세요.',
    placeHelp:'기존 장소를 선택하거나 새 장소를 검색할 수 있습니다.',

    transportInfo:'이동 정보',
    transportInfoHelp:'출발 및 도착 시간이 정해진 이동 일정을 등록합니다.',
    endpoints:'출발 · 도착',
    endpointsHelp:'출발부터 도착까지의 시간이 일정표에 반영됩니다.'
  },

  transport:{
    majorEdit:'주요 이동 편집',
    info:'이동 정보',
    infoHelp:'출발 및 도착 시간이 정해진 이동 일정입니다.',
    mode:'교통수단',
    train:'열차',
    flight:'항공',
    ship:'선박',
    bus:'버스',
    carOther:'자동차 / 기타',
    displayName:'표시 이름',
    displayNamePlaceholder:'편명, 열차명 또는 구간',
    trainNumber:'열차번호',
    serviceNumber:'편명',
    shipService:'편명 / 선박편',
    busService:'노선 / 편명',
    seat:'좌석',

    endpoints:'출발 · 도착',
    endpointsHelp:'출발지와 도착지를 선택하세요.',

    memoHelp:'승차 준비, 체크인 및 주의사항을 기록합니다.',
    createMemoHelp:'승차 준비 및 확인사항을 기록합니다.',

    color:'주요 이동 색상',
    colorHelp:'지정하지 않으면 출발일의 색상을 사용합니다.',
    colorAria:'주요 이동 색상 직접 지정',

    deleteConfirm:'이 주요 이동 일정을 삭제하시겠습니까? 출발지와 도착지 정보는 유지됩니다.',
    placesRequired:'출발지와 도착지를 선택하세요.',
    dateTimeInvalid:'출발 및 도착 일시를 확인하세요.',
    dateTimeInputInvalid:'출발 및 도착 일시를 입력하세요.',
    arrivalAfterDeparture:'도착 시각은 출발 시각 이후여야 합니다.',
    placePickerHelp:'기존 장소를 선택하거나 새 장소를 검색할 수 있습니다.',
    waypointNone:'경유지 없음'
  },

  connection:{
    autoRouteMode:'자동 경로 이동수단',
    autoRouteLookup:'자동 경로 조회',
    autoRouteHelp:'이동수단을 선택한 후 경로를 조회하세요.',
    noCallOnSelect:'경로 조회를 눌러 경로를 검색하세요.',

    modeSelection:'이동수단 선택',
    routeSelect:(label:string)=>`${label} 경로 선택`,
    unsupported:(label:string)=>`현재 지도에서는 ${label} 경로를 지원하지 않습니다.`,
    unsupportedSelected:'선택한 이동수단은 현재 지도에서 지원하지 않습니다.',
    unsupportedShort:'미지원',

    car:'자동차',
    lookup:'경로 조회',
    lookingUp:'경로 조회 중…',

    planning:'이동 계획',
    name:'이동 이름',
    namePlaceholder:'예: 호텔로 이동',
    expectedDuration:'예상 소요시간',
    expectedDurationHelp:'전체 이동에 예상되는 시간을 입력합니다.',
    memoPlaceholder:'이동 방법 및 주의사항',

    routeColor:'경로 색상',
    routeColorAria:'경로 색상 직접 지정',

    pendingAuto:'적용 대기 중인 경로',
    runtimeResult:'경로 조회 결과',
    routeLabel:(label:string)=>`${label} 경로`,
    noRuntime:'현재 설정에 맞는 경로 조회 결과가 없습니다.',

    autoWaypoints:'경유지',
    waypoint:(index:number)=>`경유지 ${index}`,
    placeSelect:'장소 선택',
    moveUp:'↑ 위로',
    moveDown:'↓ 아래로',
    addWaypoint:'+ 경유지 추가',
    waypointHelp:'이동수단이나 경유지를 변경한 경우 경로를 다시 조회하세요.',

    runtimeNotSaved:'조회된 경로 정보는 이름이나 메모에 자동으로 추가되지 않습니다.',

    toManual:'수동 계획으로 전환',
    manualEmpty:'등록된 수동 이동 계획이 없습니다.',
    boardingMemoPlaceholder:'탑승 정보 / 메모',
    segmentArrivalWaypoint:(index:number)=>`구간 ${index} 도착 경유지`,
    segmentArrival:(index:number)=>`구간 ${index} 도착 · 최종 목적지`,
    addSegment:'+ 구간 추가',

    manualWaypointHelp:'경유지는 등록된 순서대로 경로 조회에 사용됩니다.',

    autoRouteEyebrow:(label:string)=>`자동 경로 · ${label}`,
    lookingFor:(label:string)=>`${label} 경로를 조회하는 중입니다…`,
    noRoutes:(label:string)=>`조회 가능한 ${label} 경로가 없습니다.`,

    transitNoRouteHelp:'출발지와 도착지, 대중교통 운행 시간을 확인하세요.',
    routeNoRouteHelp:'출발지와 도착지의 위치를 확인하세요.',
    notAuthError:'인증 오류가 아닙니다.',

    candidate:(index:number,id:string)=>`경로 ${index} · ${id}`,
    sessionOnly:'조회한 경로의 상세 정보는 현재 브라우저 세션에서만 유지됩니다.',
    transitDetailNote:'대중교통 경로의 구간별 안내를 표시합니다.',
    applyRoute:'이 경로 적용'
  },

  dateTime:{
    am:'오전',
    pm:'오후',
    hour:'시',
    minute:'분'
  },

  labelEditor:{
    eyebrow:'TIMELINE LABEL',
    title:'라벨 수정'
  },

  sidebar:{
    bucket:'여행 보관함',
    bucketHelp:'아직 일정표에 배치하지 않은 일정입니다.',
    bucketSection:'일정',
    bucketSectionHelp:'주요 일정 목록',
    empty:'대기 중인 일정이 없습니다.',

    planB:'PLAN B',
    planBHelp:'예비 일정 · 주변 후보',
    planBEmpty:'등록된 대안이 없습니다.',

    base:'거점',
    baseHelp:'반복해서 사용할 장소',
    baseReturn:'거점은 그대로 유지됩니다.',
    baseEmpty:'등록된 거점이 없습니다.',

    storeHere:'여기에 보관',
    dropBucket:'일정 후보로 이동',
    dropPlanB:'PLAN B로 이동',
    dropBase:'거점으로 전환',

    trash:'삭제',
    trashHelp:'여기에 놓으면 일정이 삭제됩니다.',
    trashDrop:'삭제',
    deleted:'삭제했습니다.',

    duration:(minutes:number)=>` · ${minutes}분`
  },

  timeline:{
    settings:'일정표 표시 범위 설정',
    axisButton:'시간축',
    dayColors:'날짜 색상',
    axisTitle:'시간축 설정',
    axisHelp:'일정표에 표시할 시간 범위를 설정합니다.',
    displayRange:'표시 범위',
    rangeInvalid:'표시 범위를 확인하세요.',
    minRange:'표시 범위는 최소 1시간 이상이어야 합니다.',

    addLabelHere:'이 위치에 라벨 추가',
    labelInput:'라벨 입력',
    deleteLabel:'라벨 삭제',

    shortage:(value:string)=>`${value} 부족`,
    noSlack:'여유 없음',
    slack:(value:string)=>`여유 ${value}`,

    fixedConflict:'고정 일정 충돌',
    overlap:'일정 겹침',
    outsideAvailability:'운영시간 외',
    placementWarning:'배치 주의',

    autoRouteUnmeasured:'자동 경로 · 소요시간 미계산',
    untilNext:(value:string)=>`다음 일정까지 ${value}`,
    total:(value:string)=>`총 ${value}`,
    departureAt:(time:string)=>`${time} 출발`,
    arrivalAt:(time:string)=>`${time} 도착`
  },

  transit:{
    walk:'도보',
    bus:'버스',
    subway:'지하철',
    train:'철도',
    other:'대중교통',
    missing:'구간별 승하차 정보가 없습니다. 이동 전에 교통기관의 안내를 확인하세요.',
    aria:'대중교통 이동 단계',
    title:'구간별 이동 안내',
    direction:(headsign:string)=>`${headsign} 방면`,
    board:'승차',
    alight:'하차',
    stops:(count:number)=>`${count}개 정류장 이동`,
    timeNote:'출발 및 도착 시각은 기기 시간대를 기준으로 표시됩니다. 실제 운행 시각은 교통기관에서 확인하세요.'
  },

  map:{
    initFailed:'지도를 초기화하지 못했습니다.',
    displayFailed:'지도를 표시할 수 없습니다.',
    noPositionedPlaces:'지도에 표시할 위치 정보가 없습니다.',
    departure:'출발',
    arrival:'도착'
  },

  mapPoi:{
    title:'지도 장소',
    help:'이 장소를 여행 일정에 추가할 수 있습니다.',
    addVisit:'일정 후보로 추가',
    addPlanB:'PLAN B로 추가',
    addFailed:'장소를 추가하지 못했습니다.',
    providerMismatch:'현재 지도에서 사용할 수 없는 장소입니다.',
    savedFallback:'지도에서 추가한 장소'
  },

  dayPalette:{
    aria:'날짜별 색상 설정',
    title:'날짜별 색상',
    help:'같은 날짜의 일정과 경로에 동일한 기본 색상을 사용합니다.',
    colorAria:(date:string)=>`${date} 색상`,
    note:'변경한 색상은 여행을 저장할 때 함께 저장됩니다.'
  },

  auth:{
    login:'로그인',
    registerRequest:'사용자 등록',
    approvedOnly:'계정으로 로그인하거나 새 사용자 등록을 요청하세요.',
    approvalRequired:'관리자 승인 후 로그인할 수 있습니다.',
    processing:'처리 중…',
    requestRegistration:'등록 요청',
    newRegistration:'새 사용자 등록',
    backToLogin:'로그인으로 돌아가기',

    passwordMismatch:'비밀번호가 일치하지 않습니다.',
    requestFailed:'요청을 처리하지 못했습니다.',
    adminSaveFailed:'관리자 설정을 저장하지 못했습니다.',
    adminSave:'관리자 설정 저장',
    passwordChangeFailed:'비밀번호를 변경하지 못했습니다.',

    privateAccess:'여행 계획 서비스',

    bootstrapAdmin:'초기 관리자 설정',
    adminSetupTitle:'관리자 계정 설정',
    adminSetupHelp:'서비스를 사용하기 전에 관리자 계정을 설정하세요.',

    saving:'저장 중…',
    passwordChangeRequired:'비밀번호 변경 필요',
    passwordChangeHelp:'관리자가 비밀번호를 재설정했습니다. 새 비밀번호를 설정하세요.',
    checkingAccess:'접근 권한 확인 중…'
  },

  management:{
    title:'관리',
    users:'사용자 관리',
    permissions:'권한',
    canCreateTrips:'여행 생성',
    tripAccess:'여행 접근 정책',
    accessOpen:'전체 사용자',
    accessRestricted:'지정 사용자',

    passwordReset:'비밀번호 재설정',
    approve:'승인',
    disable:'비활성',
    enable:'활성화',

    providerCache:'Provider 캐시',
    cachePolicy:'캐시 정책',
    cacheCurrentTtl:'사용 기간',
    cacheMaxTtl:'정책상 최대',
    cacheRetention:'보존 기간',
    cacheEffectiveTtl:'실효 사용 기간',
    cacheStatus:'검증 상태',
    cachePermanent:'영구',
    cacheDisabled:'저장 안 함',
    cacheHours:'시간',
    cacheSave:'캐시 설정 저장',
    cacheCleanup:'정리 주기',
    cacheSafetyMargin:'기본 안전 여유',
    cacheRecords:'저장 레코드',
    cacheOverride:'설정 파일',

    cacheRetentionHelp:'사용 기간이 지난 데이터는 보존 기간 동안 유지되며, 보존 기간이 지나 삭제된 데이터는 복구되지 않습니다.',

    usageDiagnostics:'사용량 진단',
    measurementRun:'측정 구간',
    measurementStart:'측정 시작',
    measurementStop:'측정 종료',
    measurementLabel:'측정 이름',

    internalCounterNote:'내부 카운터는 TripPlanner에서 확인한 요청 및 동작 횟수이며 실제 청구 내역과 다를 수 있습니다.',

    databaseSchema:'DB 스키마',
    loadFailed:'관리 정보를 불러오지 못했습니다.',
    operationFailed:'작업을 처리하지 못했습니다.',

    temporaryPassword:(username:string)=>`${username}의 임시 비밀번호를 입력하세요.`,

    cacheSaveFailed:'캐시 설정을 저장하지 못했습니다.',
    measurementStartFailed:'측정을 시작하지 못했습니다.',
    measurementStopFailed:'측정을 종료하지 못했습니다.',

    onlyWhenChanging:'변경할 때만 입력',
    last24h:'최근 24시간',
    last7d:'최근 7일',
    last30d:'최근 30일',
    inProgress:'진행 중',
    configured:'설정됨',
    notConfigured:'미설정',
    defaultPolicy:'기본 정책 사용',
    policy:'Policy',
    hours:'hours',
    cacheRuntime:'Cache runtime',
    googleMapId:'Google Map ID',

    permanentHelp:'-1은 영구 보존이 허용된 항목에만 사용할 수 있습니다.',

    userSecurityHelp:'비밀번호 원문은 저장하거나 조회하지 않습니다. 사용자 권한과 여행별 접근 권한은 별도로 관리됩니다.',
    tripAccessHelp:'전체 사용자 또는 지정된 활성 사용자와 관리자에게 여행 접근 권한을 부여할 수 있습니다.',

    noActiveUsers:'활성 사용자가 없습니다.',
    adminAccount:'관리자 계정',
    adminAccountHelp:'관리자 인증 정보는 서버 환경 설정에 저장됩니다.',
    adminUpdate:'관리자 설정 변경',

    measurementPlaceholder:'사용량 측정',
    measurementHelp:'지정한 구간의 내부 사용량을 기록하여 Google Cloud 사용량과 비교할 수 있습니다.',

    notAvailable:'해당 없음',

    usageLabels:{
      GOOGLE_DYNAMIC_MAP:'지도 로드',
      GOOGLE_AUTOCOMPLETE_REQUEST:'장소 검색 요청',
      GOOGLE_AUTOCOMPLETE_SESSION_START:'장소 검색 세션',
      GOOGLE_AUTOCOMPLETE_SESSION_SELECTED:'장소 선택 완료',
      GOOGLE_AUTOCOMPLETE_SESSION_ABANDONED:'장소 검색 취소',
      GOOGLE_PLACE_DETAILS_ESSENTIALS:'장소 상세정보 · 기본',
      GOOGLE_PLACE_DETAILS_PRO:'장소 상세정보 · 확장',
      GOOGLE_TEXT_SEARCH_PRO:'텍스트 장소 검색',
      GOOGLE_GEOCODING:'주소 좌표 변환',
      GOOGLE_COMPUTE_ROUTES_ESSENTIALS:'경로 계산',
      PROVIDER_CACHE_HIT:'캐시 적중',
      PROVIDER_CACHE_MISS:'캐시 미적중',
      UX_TRIP_OPEN:'여행 열기',
      UX_SAVE:'저장',
      UX_UNDO:'실행 취소',
      UX_REDO:'다시 실행',
      UX_CAPTURE_ENTER:'보기 모드 진입',
      UX_CAPTURE_EXIT:'보기 모드 종료',
      UX_PIN_REFRESH:'위치 갱신'
    },

    googleMaps:'Google 지도',
    naverMaps:'NAVER 지도',
    ttlAria:(key:string)=>`${key} 사용 기간`,
    retentionAria:(key:string)=>`${key} 보존 기간`
  },

  editorEyebrow:{
    schedule:'SCHEDULE',
    base:'BASE',
    majorTransport:'MAJOR TRANSPORT'
  },

  status:{
    PENDING:'승인 대기',
    ACTIVE:'활성',
    DISABLED:'비활성'
  },

  mapPopup:{
    waiting:'대기',
    schedule:'일정',
    base:'거점',
    transport:'이동',
    waypoint:'경유',
    focus:'지도 중심으로',
    empty:'이 장소에 연결된 일정이 없습니다.',
    majorTransport:'주요 이동',
    connectionWaypoint:'이동 경유지'
  }
} as const