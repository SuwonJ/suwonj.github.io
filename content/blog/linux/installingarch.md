> [!NOTE]
> 지금껏 계속 Ubuntu와 Debian, Deb 계열에만 있다가 여러 Arch 권유에 설치해보았다

듀얼부팅이라 윈도우부터 간단히 설치한다.
## 윈도우 설치하기
Shift+F10으로 cmd를 열 수 있다. 열어준 후 `diskpart`를 켠다.
```diskpart
list disk
sel disk *숫자*
clean
convert gpt

cre par efi size=300
format fs=fat32 quick
assign letter=S

cre par pri size=200000
format fs=ntfs quick
assign letter=C
```
`assign letter=C` 에서 C가 이미 할당된 위치라고 뜬다. 무시해도 되더라
이제 윈도우에 필요한 파티션은 모두 설정되었다. cre par pri로 생성된 파티션을 선택하고 윈도우를 설치한다.

## 아치리눅스 설치하기
https://archlinux.org/download/ 에서 ISO 파일 다운로드.
부팅하면 당황스럽게도 셸만 뜬다. 

### Wi-Fi 연결하기
와이파이 환경이라면 인터넷 연결이 필요하다. `iwctl`을 이용해서 와이파이에 연결해야 한다.
```iwctl
device list
```
위 명령어로 와이파이 랜카드 장치명을 확인할 수 있다.
아래 명령어로 와이파이를 연결하자.
```iwctl
station *wlan* connect *SSID*
```

자신의 SSID가 헷갈린다면 
```iwctl
station *wlan* scan
station *wlan* get-networks
```
로 SSID 검색을 할 수 있다.

연결이 완료되면 `exit`로 `iwctl`을 끄자.


## 파티셔닝
```zsh
lsblk
```
디스크와 파티션의 상태를 확인할 수 있다.

```zsh
cfdisk /dev/*디스크*
```
그러면 테이블이 뜰 것. 윈도우 밑 텅 빈 비할당 구간에 swap, /, /home 세개의 구역을 위한 파티션을 만들 것이다. 
swap은 hibernation을 위해 보통 램의 1.5배로 할당하고, / 와 /home은 / 에 30 나머지를 home으로 하는 식으로 하더라 /로 합쳐도 무방하지만 리눅스를 너무 자주 갈아엎어 나누어야 할 필요성을 느끼게 되었다.

비할당 공간으로 가면 밑에 New라고 뜬다. 누른 후 22G 후 엔터. Type을 Linux swap으로 바꾸어 준다. 

같은 방식으로 / 와 /home 도 진행. 30G + 나머지로 하였다. 얘네는 Linux partiton? Type을 바꾸어 줄 필요 없다.

Write로 마쳐주자.

```bash
mkfs.ext4 /dev/*세부파티션루트*
mkfs.ext4 /dev/*세부파티션홈*

mkswap /dev/*세부파티션swap*
```
파ㅏ티셔닝이 끝났다.

## archinstall
ㅐㄱ쩌는 archinstall로 아치 리눅스를 한번에 설치할 수 있다. 
ghostty, neovim 같이 설치하였다.
## nimf
github 영어설명대로 하면 안된다. 
```zsh
# 최신 libhangul-git 패키지 설치
git clone https://aur.archlinux.org/libhangul-git.git

cd libhangul-git

makepkg -si 

# nimf 설치
git clone https://github.com/hamonikr/nimf.git

cd nimf

makepkg -si 
```
```zsh
nvim ~/.xprofile
```
```nvim
export GTK_IM_MODULE=nimf
export QT4_IM_MODULE="nimf"
export QT_IM_MODULE=nimf
export XMODIFIERS="@im=nimf"
```
넣어준다.
```bash
xmodmap -pke > ~/xmodmap_original\```
xmodmap -e 'keycode 108 = Hangul'
xmodmap -pke > ~/.Xmodmap
xmodmap ~/.Xmodmap
```
키맵을 바꿀 수 있다. 이후 재부팅 후 nimf config에서 한영키 추가해주면 됨 nimf는 Alt R로 인식하는데 파이어폭스는 아닌가봄 정상작동함.
## 한글 설치
세상에나 한글 입력은 되는데 한글 표시는 되지 않는 기이한 현상이 일어난다. 
```bash
wget https://github.com/sun-typeface/SUITE/releases/latest/download/SUITE-ttf.zip
mkdir -p /usr/local/share/fonts
unzip SUITE-ttf.zip
cp /SUITE-ttf/SUITE* /usr/local/share/fonts/
```
SUITE 폰트를 설치하였다. 나눔고딕은 더 쉬울텐데 내가 좋아하지 않는다.

## zsh 설치
```bash
pacman -S zsh
chsh -s $(which zsh)
```

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k
echo 'source ~/powerlevel10k/powerlevel10k.zsh-theme' >>~/.zshrc
```

## wifi
NetworkManage가 안된다. chroot로 해경.

파티션 /mnt 
archchroot /mnt 
pacman -S networkmanager 

나와서 데탑에서
sudo systemctl start NetworkManager
sudo systemctl enable NetworkManager

## EFI

```bash
efibootmgr -v
```
위 명령어로 확인.
```
sudo efibootmgr --create --disk /dev/nvme0n1 --part 1 --label "Arch Linux" --loader /EFI/BOOT/bootx64.efi
```
efi 파일은 있는데 데스크탑이 잡지 않았다. 설정함.