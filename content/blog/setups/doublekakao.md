# 가장 빠른 해결법 - 카카오톡을 이용하지 않기

이 방법보다 연락할 사람과 같이 텔레그램으로 이주하는게 더 현명한 선택일 가능성이 큽니다. **진심이에요.** 인식 때문에 아직 한번도 써보지 못했다면, 한번쯤은 써 보세요. 그래도 카톡을 버릴 수 없을 것 같다면, 진행합시다

# ⚠️ 시작 전 유의사항

## 준비물

‧ 메인폰 1개

‧ 매지스크 루팅된 서브폰 1개

‧ 카카오톡 채팅 백업

## 시스템 요구사항

<span style='background-color: red'>본 방식은 서브폰에 **루팅**이 필요한 방식입니다.
</span>

루팅이 뭔지 잘 아시는 분들이 하시는 것을 강력 추천합니다. 루팅이 익숙하지 않지만 이 방법이 꼭 필요하다면 루팅에 대해 사전 정보들을 찾아보신 뒤 루팅을 해 오시는 것을 추천합니다. 본 문서에서 루팅을 하는 방법은 소개하지 않습니다.

## 추가적인 유의사항

카카오톡은 현재 공식적으로 한 계정으로 스마트폰,태블릿,컴퓨터에서 동시에 이용할 수 있습니다. 이 방식은 안드로이드 스마트폰을 갤럭시 태블릿으로 위장하여 카카오톡을 두 스마트폰에서 동시에 이용할 수 있도록 하는 방식이며, 기존에 태블릿을 쓰고 있었다면 기존 사용하던 태블릿에선 로그아웃됩니다.

모든 준비가 끝나셨다면, 시작해 볼까요!

# 시작하기 !

## 1. Termux 설치하기

https://f-droid.org/en/packages/com.termux/
서브폰에서 위 링크에서 최신 버전의 Termux를 설치해 주세요.

<span style='background-color: red'>Download F-Droid 버튼을 누르지 않고 조금 더 밑으로 내려가서 최신 버전의 Download APK 버튼을 눌러주시면 다른 앱을 설치할 필요 없이 Termux를 바로 설치할 수 있습니다.
</span>

설치가 끝났다면, Termux는 잠시 두고 다음 단계로 넘어가겠습니다.

## 2. MagiskHidePropsConf 설치하기

MagiskHidePropsConf 는 매지스크 모듈입니다.

https://github.com/Magisk-Modules-Repo/MagiskHidePropsConf/releases

서브폰에서 위 링크로 들어가서
Source code (zip) 이나
Source code (tar.gz) 가 아닌 최신 버전의 MagiskHidePropsConf-vx.x.x.zip 모양으로 되어 있는 zip 파일을 다운받아 주세요.

이제 Magisk 앱에 들어가서 MagiskHidePropsConf 모듈을 설치해 주세요.

<!-- 사진 첨부 필요할 듯 -->

설치가 완료되면 아래의 재부팅 버튼을 눌러서 폰을 재부팅해 줍시다.

## 3. 폰 기종 변조하기

위의 MagiskHidePropsConf가 정상적으로 설치되었다면, 1단계에서 설치했던 Termux 앱을 열어 su를 치고 엔터해 줍시다.

```
Welcome to Termux!
Community forum: https://termux.com/community Gitter chat: https://gitter.im/termux/termux
IRC channel: #termux on libera.chat
Working with packages:
* Search packages: pkg search <query>
* Install a package: pkg install <package> * Upgrade packages: pkg upgrade
Subscribing to additional repositories:
* Root: * X11:
pkg install root-repo
pkg install x11-repo
Report issues at https://termux.com/issues

$ su
```

매지스크에서 루트 권환 확인 창이 뜹니다. GRANT 해줍시다. 루트 유저로 들어왔다면, props를 쳐 줍시다.

```
: /data/data/com.termux/files/home # props
```

MagiskHide Props Config가 실행됩니다.

5를 선택해 주세요.

```
MagiskHide Props Config v6.1.2 by Didgeridoohan @ XDA Developers
Select an option below.
===
1- Edit device fingerprint
2- Force BASIC key attestation B
Device simulation (disabled) 4- Edit MagiskHide props (active)
5- Add/edit custom props
6- Delete prop values
7- Script settings
8- Collect logs
u - Perform module update check r - Reset all options/settings
b- Reboot device
e- Exit
See the module readme or the
support thread @ XDA for details.

Enter your desired option: 5
```

n을 입력해 주세요.

```
MagiskHide Props Config v6.1.2 by Didgeridoohan @ XDA Developers
Custom props Select an option below:
Set or edit custom prop values for
Currently no custom props set.
Please add one by selecting
"New custom prop" below.
n New custom prop
b- Go back to main menu
e - Exit
See the module readme or the support thread @ XDA for details.

Enter your desired option: n
```

ro.product.model을 입력해 주세요.

```
MagiskHide Props Config v6.1.2
by Didgeridoohan @ XDA Developers
New custom prop
Enter the prop to set. Example:
ro.sf.lcd_density
b- Go back e - Exit
Enter your desired option: ro.product.model
```

SM-X700을 입력해 주세요.

```
MagiskHide Props Config v6.1.2 by Didgeridoohan @ XDA Developers
ro.product.model
===
Enter the value you want to set
ro.product.model to, below.
or select from the options
The currently set value is:
Pixel 4a
Please enter the new value.
b- Go back e - Exit
Enter your desired option: SM-X700
```

y를 입력해 주세요.

```
MagiskHide Props Config v6.1.2
by Didgeridoohan @ XDA Developers
ro.product.model
This will set ro.product.model to:
SM-X700
Pick an option below to change
what boot stage the prop will
be set in, or set/reset a delay:
1 - Default (current)
2 - post-fs-data
3 late_start service 4 Both boot stages
d - Delay
Do you want to continue?
Enter y(es), n(o), exit)
or an option from above: y
```

y를 입력해 주세요.

```
MagiskHide Props Config v6.1.2
by Didgeridoohan @ XDA Developers
Reboot
ro.product.model
Reboot for changes to take effect.
Do you want to reboot now (y/n)?
Enter y(es), n(o) or e(xit): y
```

폰이 재부팅되며 설정이 마무리됩니다.

## 4. 카카오톡 설정하기

### 4-1. 메인폰에서 카톡 백업하기

- 카카오톡 하단 메뉴바에서 점 3개의 더보기 메뉴로 들어가 주세요.

- 우측 상단의 설정으로 들어가 주세요.

- 채팅 설정으로 들어가 주세요.

- 채팅 백업 설정으로 들어가 주세요.

- 비밀번호를 설정하고 채팅을 백업해 주세요.

### 4-2.서브폰에서 카톡 설치하기

- 현재 카카오톡이 없다면 카카오톡을 구글 플레이 스토어에서 설치해 주세요.

- 카카오톡에 들어가 로그인창에서 **다른 기기와 함께 사용**이 뜨는지 확인해 주세요.
  뜬다면, 다음 과정으로 넘어갑시다!

- 메인폰에서 사용하는 계정과 같은 계정으로 로그인해 주세요.

- 메인폰에서 백업된 데이터를 복원해 주세요

## 5.완성

백업까지 모두 끝났다면, 모든 과정이 끝나게 됩니다. 카톡 계정 1개를 두 폰에서 즐겨 보세요!