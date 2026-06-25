BOOX 알 수 없는 OS를 믿을 수는 없으니 최대한 원 상태로 이용해보기 위해서 수정할 수 있다.

## 1. ROM 바꾸기
해외용 롬으로 바꾸어 공식적으로 Nearby Share을 이용하기 편하다.
롬파일은 여기서 얻을 수 있다.
https://github.com/Hagb/decryptBooxUpdateUpx

ONYX 서버에서는 업데이트 파일을 .npx라는 암호화된 확장자를 이용하는데, 위 레포지토리에서는 그 확장자를 인식 가능한 .zip파일로 변환해준다. 

우선 npx를 다운받아주자. 
최신 파일은 아래와 같은 링크 형식으로 존재한다고 한다. 모델명인 `Go6`를 넣어 파일을 받자.
```
http://data.onyx-international.cn/api/firmware/update?where={"buildNumber":0,"buildType":"user","deviceMAC":"","lang":"en_US","model":"<모델명>","submodel":"","fingerprint":""}
```

그렇다면 Go6의 링크는 다음과 같다:

```
http://data.onyx-international.cn/api/firmware/update?where={"buildNumber":0,"buildType":"user","deviceMAC":"","lang":"en_US","model":"Go6","submodel":"","fingerprint":""}
```
npx를 받을 수 있다. 이제 이 파일을 해야한다.

디펜던시를 위해 pycryptodome를 설치하자. 

```zsh
pip install pycryptodome
```

Github 레포를 Clone이나 압축파일로 다운받아준 뒤 npx 파일을 해당 경로에 넣어주고 다음 파이썬을 이 구문으로 실행시켜 주면 zip파일을 얻을 수 있다. 
```
python DeBooxUpx.py <device model> [input file name [output file name]]
```

ADB를 설치해주자. 

이제는 포크를 컴퓨터에 
```
adb reboot recovery
```
로 리커버리모드에 들어가준 다음,  `Apply update from ADB`로 이동해 전원버튼을 눌러준다. 
컴퓨터에서
```
ADB sideload update.zip으로 롬을 올려준다.
```
롬이 성공적으로 글로벌 GO롬으로 바뀌었다.

## 2. 개인정보 지키기 & 최적화하기
https://appsec.space/posts/onyx-boox-go-10.3/
는 NTP서버를 이용하는데, 잘 알려진 NTP 서버로 손쉽게 바꿀 수 있다.
```
abd shell settings put global ntp_server pool.ntp.org
adb shell settings put global ntp_server_2 kr.pool.ntp.org
```
portal ping도 바꾸어주자
```
adb shell settings put global captive_portal_http_url "http://connectivitycheck.android.com/generate_204"
adb shell settings put global captive_portal_https_url "https://connectivitycheck.android.com/generate_204"
adb shell settings put global captive_portal_fallback_url "http://connectivitycheck.gstatic.com/generate_204"
```

런처가 깔끔하고 좋다곤 여겨지나.. 필요하지 않은 스토어 탭이 남아있다던가 ONYX 계정에 로그인하라고 한다거나.. 불편하다고 여겨졌다.
새 런처를 설치해주자.
우선 새 런처 설정 전 설치해주자. 
Aurora Store을 설치해 Play Store의 대용으로 사용하자. 

나는 unlauncher의 수정본을 직접 제작해 설치하였다. 



모든설 의심하고 믿지 않는다는 마음으로 시작했으니 쓸모없다고 여겨지는 계산기.. 등등은 모두 지워버린다.
```
adb shell
```
로 들어간 뒤, 불필요하다고 여겨지는 앱들 목록이다. 
```
pm uninstall -k --user 0 com.android.bips
pm uninstall -k --user 0 com.android.bluetoothmidiservice
pm uninstall -k --user 0 com.android.cameraextensions
pm uninstall -k --user 0 com.android.cts.ctsshim
pm uninstall -k --user 0 com.android.dreams.phototable
pm uninstall -k --user 0 com.android.emergency
pm uninstall -k --user 0 com.android.internal.display.cutout.emulation.corner
pm uninstall -k --user 0 com.android.internal.display.cutout.emulation.double
pm uninstall -k --user 0 com.android.internal.display.cutout.emulation.hole
pm uninstall -k --user 0 com.android.internal.display.cutout.emulation.tall
pm uninstall -k --user 0 com.android.internal.display.cutout.emulation.waterfall
pm uninstall -k --user 0 com.android.internal.systemui.navbar.gestural
pm uninstall -k --user 0 com.android.internal.systemui.navbar.gestural_extra_wide_back
pm uninstall -k --user 0 com.android.internal.systemui.navbar.gestural_narrow_back
pm uninstall -k --user 0 com.android.internal.systemui.navbar.gestural_wide_back
pm uninstall -k --user 0 com.android.internal.systemui.navbar.threebutton
pm uninstall -k --user 0 com.android.printservice.recommendation
pm uninstall -k --user 0 com.android.providers.blockednumber
pm uninstall -k --user 0 com.android.providers.contacts
pm uninstall -k --user 0 com.android.quicksearchbox
pm uninstall -k --user 0 com.android.smspush
pm uninstall -k --user 0 com.android.theme.font.notoserifsource
pm uninstall -k --user 0 com.android.vending
pm uninstall -k --user 0 com.google.android.apps.restore
pm uninstall -k --user 0 com.google.android.gms.location.history
pm uninstall -k --user 0 com.google.android.overlay.gmsconfig.common
pm uninstall -k --user 0 com.google.android.syncadapters.calendar
pm uninstall -k --user 0 com.google.android.syncadapters.contacts
pm uninstall -k --user 0 com.onyx.aiassistant
pm uninstall -k --user 0 com.onyx.android.production.test
pm uninstall -k --user 0 com.onyx.appmarket
pm uninstall -k --user 0 com.onyx.calculator
pm uninstall -k --user 0 com.onyx.clock
pm uninstall -k --user 0 com.onyx.dict
pm uninstall -k --user 0 com.onyx.easytransfer
pm uninstall -k --user 0 com.onyx.gallery
pm uninstall -k --user 0 com.onyx.kime
pm uninstall -k --user 0 com.onyx.latinime
pm uninstall -k --user 0 com.onyx.mail
pm uninstall -k --user 0 com.onyx.musicplayer
pm uninstall -k --user 0 com.onyx.voicerecorder
pm uninstall -k --user 0 com.qualcomm.embms
pm uninstall -k --user 0 com.qualcomm.qti.seccamservice
pm uninstall -k --user 0 com.qualcomm.qti.server.qtiwifi
pm uninstall -k --user 0 com.qualcomm.qti.services.systemhelper
pm uninstall -k --user 0 com.qualcomm.qti.uim
pm uninstall -k --user 0 com.qualcomm.qti.uimGbaApp
pm uninstall -k --user 0 com.qualcomm.qti.xrcb
pm uninstall -k --user 0 com.qualcomm.qti.xrvd.service
pm uninstall -k --user 0 com.qualcomm.qtil.aptxui
pm uninstall -k --user 0 org.chromium.chrome
```

추가로 ONYX 앱이 남아있는지는 
```
pm list packages | grep onyx
```
로 확인할 수 있으며, 전체 리스트는 
```
adb shell pm list packages
```
로 확인할 수 있다. 

재설치는 
```
pm install-existing --user 0 [패키지명]
```
를 통해 가능하다.